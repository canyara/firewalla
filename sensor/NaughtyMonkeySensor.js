/*    Copyright 2016 Firewalla LLC 
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
'use strict'

const firewalla = require('../net2/Firewalla.js')
const log = require("../net2/logger.js")(__filename)

const fc = require("../net2/config.js")
const f = require("../net2/Firewalla.js")

const fs = require('fs')
const exec = require('child-process-promise').exec

const Promise = require('bluebird');

const Sensor = require('./Sensor.js').Sensor

const async = require('asyncawait/async');
const await = require('asyncawait/await');

const HostManager = require('../net2/HostManager')
const hostManager = new HostManager('cli', 'server');

const sem = require('../sensor/SensorEventManager.js').getInstance();

class NaughtyMonkeySensor extends Sensor {

  job() {
    return async(() => {
      if(fc.isFeatureOn("naughty_monkey")) {
        // do stuff   
        this.malware()
      }

      setTimeout(() => {
        this.job()                
      }, this.getRandomTime())
    })
  }
  
  randomFindDevice() {
    let hostCount = hostManager.hostsdb.length
    if(hostCount > 0) {
      let randomHostIndex = Math.floor(Math.random() * hostCount)
      if(randomHostIndex == hostCount) {
        randomHostIndex = hostCount - 1
      }
      return hostManager.hostsdb[randomHostIndex]
    } else {
      return null
    }
  }

  malware() {
    const host = this.randomFindDevice()
    const ip = host.ipv4Addr

    // node malware_simulator.js --src 176.10.107.180  --dst 192.168.2.166 --duration 1000 --length 100000

    if(ip) {
      const cmd = `node malware_simulator.js --src 176.10.107.180  --dst ${ip} --duration 1000 --length 100000`
      log.info("Release a monkey:", cmd)
      return exec(cmd, {
        cwd: f.getFirewallaHome() + "./testLegacy/"
      })
    }    
  }

  run() {

    // if(!f.isDevelopmentVersion()) {
    //   return // do nothing if non dev version
    // }

    setTimeout(() => {
      this.job()
    }, this.getRandomTime())
  }

  // in milli seconds
  getRandomTime() {
    return Math.floor(Math.random() * 1000 * 3600)
  }
}

module.exports = NaughtyMonkeySensor

