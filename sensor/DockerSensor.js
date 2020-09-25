/*    Copyright 2020 Firewalla Inc.
 *
 *    This program is free software: you can redistribute it and/or  modify
 *    it under the terms of the GNU Affero General Public License, version 3,
 *    as published by the Free Software Foundation.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    GNU Affero General Public License for more details.
 *
 *    You should have received a copy of the GNU Affero General Public License
 *    along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';

const log = require('../net2/logger.js')(__filename, 'info');
const { Sensor } = require('./Sensor.js');
const ipset = require('../net2/Ipset.js');
const platform = require('../platform/PlatformLoader.js').getPlatform();

const { exec } = require('child-process-promise');
const _ = require('lodash')

const { IPSET_DOCKER_WAN_ROUTABLE, IPSET_DOCKER_LAN_ROUTABLE } = ipset.CONSTANTS


// check ipset and add corrsponding route if network exists in docker
class DockerSensor extends Sensor {

  constructor() {
    super()
    this.wanRoutable = []
    this.lanRoutable = []
  }

  async listNetworks() {
    const listOutput = await exec('sudo docker network list')
    const lines = listOutput.stdout
      .split('\n')
      .slice(1, -1)
      .map(s => s.split(/\s+/)) // NETWORK ID, NAME, DRIVER, SCOPE
      // .filter(n => n[2] == 'bridge') // only taking care of bridge network for now

    const networks = []
    for (const line of lines) {
      const inspect = await exec(`sudo docker network inspect ${line[1]}`)
      const network = JSON.parse(inspect.stdout)
      networks.push(network[0])
    }

    return networks
  }

  async getInterface(network) {
    const routes = await exec(`ip route`)
    const route = routes.stdout.split('\n').slice(0, -1).find(l => l.startsWith(network))
    if (!route) return null

    return route.match(/dev ([^ ]+) /)[1]
  }

  async addToTable(network, table) {
    const route = `${network} table ${table}`
    try {
      const check = await exec(`ip route show exact ${route}`)
      if (check.stdout.length != 0) {
        log.info('Route exists, ignored', route)
        return
      }
    } catch(err) {
      log.err('failed to check route presence', err)
    }

    await exec(`sudo ip route add ${route}`)
    log.info(`Added ${route}`)
  }

  async addRoute() {
    try {
      const dockerNetworks = await this.listNetworks()
      const userLanNetworks = await ipset.list(IPSET_DOCKER_LAN_ROUTABLE)
      const userWanNetworks = await ipset.list(IPSET_DOCKER_WAN_ROUTABLE)

      for (const network of dockerNetworks) {
        try {
          const subnet = _.get(network, 'IPAM.Config[0].Subnet', null)
          const intf = await this.getInterface(subnet)
          const route = `${subnet} dev ${intf}`

          if (userLanNetworks.includes(subnet)) {
            await this.addToTable(route, 'lan_routable')
          }
          if (userWanNetworks.includes(subnet)) {
            await this.addToTable(route, 'wan_routable')
          }
        } catch(err) {
          log.error('Error adding route', network, err)
        }
      }
    } catch(err) {
      log.error('Error obtaining network meta', err)
    }
  }

  async run() {
    if (!platform.isDockerSupported())
      return;
    try {
      await ipset.create(IPSET_DOCKER_WAN_ROUTABLE, 'hash:net')
      await ipset.create(IPSET_DOCKER_LAN_ROUTABLE, 'hash:net')
      await exec(`sudo systemctl start docker`)
    } catch(err) {
      log.error("Failed to initialize DockerSensor", err)
    }

    setInterval(this.addRoute.bind(this), 30 * 1000)
  }
}

module.exports = DockerSensor;
