#!/usr/bin/env node

'use strict';

/****************************
Includes
****************************/

var pkg =       require('./package.json');
var log =       require('yalm');
var config =    require('./config.js');
var Mqtt =      require('mqtt');
var Cul =       require('cul');
var fs = require('fs');

/****************************
Vars
****************************/

let mqttConnected;
let culConnected;

var watchdogTimer;
var watchdogTriggered = false;

var culOpts = {};

var topicMap = {};
var topicMapInv = {};
var dimmerMap = {};

var mqttOptions;

/****************************
Startup & Init
****************************/

log.setLevel(config.verbosity);
log.info(pkg.name + ' ' + pkg.version + ' starting');
//log.debug('config ', config);

if (config.fs20Map && fs.existsSync(config.fs20Map)) {
    log.debug('loading config map');
    topicMap = require(config.fs20Map);
    //log.debug('config map: ', topicMap);
}
//log.debug('config map: ', topicMap);

for (var key in topicMap) {
    if (topicMapInv[topicMap[key]]) {
        log.error("fs20-map is not unique, <", key, "> has more than one values.");
        stop();
    }
    topicMapInv[topicMap[key]] = key;
}

if (config.culConnectionMode) {
    culOpts.connectionMode = config.culConnectionMode;
}
if (config.culSerialport) {
    culOpts.serialport = config.culSerialport;
}
if (config.culBaudrate) {
    culOpts.baudrate = config.culBaudrate;
}
if (config.culCoc) {
    culOpts.coc = config.culCoc;
}
if (config.culScc) {
    culOpts.scc = config.culScc;
}
if (config.culHost) {
    culOpts.host  = config.culHost;
}
if (config.culPort) {
    culOpts.port  = config.culPort;
}
if (config.culNoNetworkTimeout) {
    culOpts.networkTimeout = config.culNoNetworkTimeout;
}
culOpts.mode = 'SlowRF';
culOpts.parse = true;
culOpts.init = true;
culOpts.rssi = true;
culOpts.repeat = true;
//culOpts.debug = true;

log.debug(JSON.stringify(culOpts));

var cul = new Cul(culOpts);

if (config.mqttNoRetain) {
    mqttOptions = { retain: false, qos: config.mqttQos };
} else {
    mqttOptions = { retain: true, qos: config.mqttQos };
}

cul.on('ready', () => {
    log.info('cul ready');
    culConnected = true;
    postConnected();
    //TODO: remove as soon as repeat flag is integrated in cul master:
    cul.write("X23");
});

cul.on('data', (raw, obj) => {
    log.debug('cul data received', raw, JSON.stringify(obj));

    if (obj && obj.protocol && obj.data) {
        switch (obj.protocol) {
            case 'FS20':
                if (dim(map('FS20/' + obj.address), obj.data.cmd)) {
                    dimmerPublish('FS20/' + obj.address, obj.data, obj.rssi, obj.device);
                }
                break;

            default:
                log.debug('non-FS20 protocols ignored', obj.protocol);
                mqttPublish(config.name + '/heartbeat', '1', mqttOptions);
        }
    }
});

cul.on('close', () => {
    log.debug('cul closed');
    culConnected = false;
    postConnected();
});

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

/****************************
Startup MQTT
****************************/

log.info('mqtt trying to connect', config.mqttUrl);
watchdogInit();

const mqtt = Mqtt.connect(config.mqttUrl, {
    clientId: config.name + '_' + Math.random().toString(16).substr(2, 8),
    will: { topic: config.name + '/connected', payload: '0', retain: true, qos: config.mqttQos },
    username: config.mqttUsername,
    password: config.mqttPassword
});

mqtt.on('connect', function () {
    mqttConnected = true;

    log.info('mqtt connected', config.mqttUrl);
    mqtt.publish(config.name + '/connected', '1', mqttOptions); 

    log.debug('mqtt subscribe', config.name + '/set/#');
    mqtt.subscribe(config.name + '/set/#');

    log.debug('mqtt subscribe', config.name + '/get/#');
    mqtt.subscribe(config.name + '/get/#');

    postConnected();
});

mqtt.on('close', function () {
    if (mqttConnected) {
        mqttConnected = false;
        log.warn('mqtt closed ' + config.mqttUrl);
    }
});

mqtt.on('error', function (err) {
    if (mqttConnected) {
        mqttConnected = false;
        log.error('mqtt error ' + err);
    }
});

mqtt.on('offline', () => {
    if (mqttConnected) {
        mqttConnected = false;
        log.warn('mqtt offline');
    }
});

mqtt.on('reconnect', () => {
    if (mqttConnected) {
        mqttConnected = false;
        log.warn('mqtt reconnect');
    }
});

mqtt.on('message', (topic, payload) => {
    payload = payload.toString();
    log.debug('mqtt <', topic, payload);
    const parts = topic.split('/');
    if (parts.length === 3 && parts[1] === 'set') {
        // Topic <name>/set/mapName
        if (topicMapInv[parts[2]]) {
            log.debug('mqtt set by mapName:', topicMapInv[parts[2]].substr(5, 4), topicMapInv[parts[2]].substr(9, 2), payload);
            dimmerSet(payload, topicMapInv[parts[2]]);
        } else {
            log.error("mqtt set by mapName, not found:", parts[2]);
        }
    } else if (parts.length === 4 && parts[1] === 'set') {
        // Topic <name>/set/PROT/ADR
        if (cul.cmd('FS20', parts[3].substr(0, 4), parts[3].substr(4, 2), payload)) {
            log.debug("mqtt set by PROT/ADR: ", parts[2] + "/" + parts[3]);
        } else {
            log.error("error on mqtt set by PROT/ADR: ", parts[2] + "/" + parts[3]);
        }
        dimmerSet(payload, parts[2] + '/' + parts[3]);
        //dimmerPublish(parts[2] + '/' + parts[3], { cmdRaw: '', cmd: '' }, null, parts[2]);

    } else if (parts.length === 3 && parts[1] === 'get') {
        // Topic <name>/get/mapName
        if (topicMapInv[parts[2]]) {
            log.debug("mqtt get by mapName, found: ", parts[2], topicMapInv[parts[2]]);
            dimmerPublish(topicMapInv[parts[2]], {cmdRaw: '', cmd: ''}, null, 'FS20');
        } else {
            log.error("mqtt get by mapName, not found: ", parts[2]);
        }
    } else if (parts.length === 4 && parts[1] === 'get') {
        // Topic <name>/get/PROT/ADR
        if (dimmerMap[map(parts[2] + '/' + parts[3])]) {
            dimmerPublish(parts[2] + '/' + parts[3], { cmdRaw: '', cmd: '' }, null, parts[2]);
            log.debug("mqtt get by PROT/ADR: ", parts[2] + "/" + parts[3]);
        } else {
            log.error("mqtt get by PROT/ADR, not found: ", parts[2]);
        }
    } else {
        log.error('mqtt <', topic, payload);
    }
});

function mqttPublish(topic, payload, options) {
    if (typeof payload === 'object') {
        payload = JSON.stringify(payload);
    } else if (payload) {
        payload = String(payload);
    } else {
        payload = '';
    }
    mqtt.publish(topic, payload, options, err => {
        if (err) {
            log.error('mqtt publish', err);
        } else {
            watchdogReload();
            log.debug('mqtt >', topic, payload);
        }
    });
}

/****************************
Functions
****************************/

function dimmerPublish(address, data, rssi, device) {
    const prefix = config.name + '/status/';
    let topic;
    var payload = {
        ts: new Date().getTime(),
        cul: {}
    };
    topic = prefix + map(address);

    if (config.jsonValues) {
        payload.val = data.cmdRaw;
        payload.cul.fs20 = data;
        if (rssi) {
            payload.cul.rssi = rssi;
        }
        if (device) {
            payload.cul.device = device;
        }
        payload.dimLevel = dimmerMap[map(address)].level;
        log.debug('FS20 data parsed', topic, payload.val, payload.cul.fs20.cmd);
    } else {
        payload = dimmerMap[map(address)].level.toString();
        log.debug('FS20 cmd received', topic, data.cmdRaw, dimmerMap[map(address)].level);
    }
    mqttPublish(topic, payload, mqttOptions);
}

function dimmerSet(command, deviceAdr) {
    command = command.toLowerCase();
    log.debug("dimmer set", deviceAdr, command);
    if (command == 'on' || command == 'off') {
        //all fine, just leave it
    } else {
        command = parseInt(command);
        log.debug("dimmer set command parsed", deviceAdr, command);
        if (!isNaN(command)) {
            if (command <= 0) {
                command = 'off';
            } else if (command < 10) {
                command = "dim0" + quantize(command).toString() + "%";
            } else {
                command = "dim" + quantize(command).toString() + "%";
            }
        } else {
            command = '';
        }
    }
    log.debug("dimmer set command finished", deviceAdr, command);
    if (command != '' && dim(map(deviceAdr), command, true)) {
        if (cul.cmd('FS20', deviceAdr.substr(5, 4), deviceAdr.substr(9, 2), command)) {
            dimmerPublish(deviceAdr, { cmdRaw: '', cmd: '' }, null, 'FS20');
        } else {
            log.debug('dimmer set error on cul command', 'FS20', deviceAdr.substr(5, 4), deviceAdr.substr(9, 2), command);
        }
    } else {
        log.error("dimmer set error on mqtt set by mapName", deviceAdr);
    }
}

function dim(dimmer, cmd, nodupe = false) {
    log.debug('dimmer check', dimmer, cmd);
    if (!dimmerMap[dimmer]) {
        log.debug('new dimmer', dimmer, cmd);
        dimmerMap[dimmer] = { };
        dimmerMap[dimmer].ts = Date.now() - 500;
        dimmerMap[dimmer].level = 0;
        dimmerMap[dimmer].oldLevel = 100;
        dimmerMap[dimmer].lastDir = 'down';
        dimmerMap[dimmer].dimwait = Date.now() - 1;
    }

    if ((!nodupe) && (Date.now() - dimmerMap[dimmer].ts < 120 && dimmerMap[dimmer].lastcmd === cmd)) {
        log.debug('dimmer duplicate, ignoring', dimmer, cmd);
        return false;
    } else {

        switch (cmd) {
            case 'off':
            case '0':
            case '00':
            case 'off-for-timer':
            case '18':
                if (dimmerMap[dimmer].level > 0) {
                    dimmerMap[dimmer].oldLevel = dimmerMap[dimmer].level;
                    dimmerMap[dimmer].level = 0;
                }
                break;

            case 'dim06%':
            case 'dim6%':
            case '01':
                dimmerMap[dimmer].level = 6;
                break;
            case 'dim12%':
            case '02':
                dimmerMap[dimmer].level = 12;
                break;
            case 'dim18%':
            case '03':
                dimmerMap[dimmer].level = 18;
                break;
            case 'dim25%':
            case '04':
                dimmerMap[dimmer].level = 25;
                break;
            case 'dim31%':
            case '05':
                dimmerMap[dimmer].level = 31;
                break;
            case 'dim37%':
            case '06':
                dimmerMap[dimmer].level = 37;
                break;
            case 'dim43%':
            case '07':
                dimmerMap[dimmer].level = 43;
                break;
            case 'dim50%':
            case '08':
                dimmerMap[dimmer].level = 50;
                break;
            case 'dim56%':
            case '09':
                dimmerMap[dimmer].level = 56;
                break;
            case 'dim62%':
            case '0a':
                dimmerMap[dimmer].level = 62;
                break;
            case 'dim68%':
            case '0b':
                dimmerMap[dimmer].level = 68;
                break;
            case 'dim75%':
            case '0c':
                dimmerMap[dimmer].level = 75;
                break;
            case 'dim81%':
            case '0d':
                dimmerMap[dimmer].level = 81;
                break;
            case 'dim87%':
            case '0e':
                dimmerMap[dimmer].level = 87;
                break;
            case 'dim93%':
            case '0f':
                dimmerMap[dimmer].level = 93;
                break;

            case 'dim100%':
            case '10':
            case 'on-for-timer':
            case '19':
                dimmerMap[dimmer].level = 100;
                break;

            case 'on':
            case '11':
            case 'on-old-for-timer':
            case '1a':
                if (dimmerMap[dimmer].level < 6) {
                    dimmerMap[dimmer].level = dimmerMap[dimmer].oldLevel;
                }
                break;

            case 'toggle':
            case '12':
                if (dimmerMap[dimmer].level < 6) {
                    dimmerMap[dimmer].level = dimmerMap[dimmer].oldLevel;
                } else {
                    dimmerMap[dimmer].oldLevel = dimmerMap[dimmer].level;
                    dimmerMap[dimmer].level = 0;
                }
                break;

            case 'dimup':
            case '13':
                dimmerMap[dimmer].lastDir = 'up';
                dimmerMap[dimmer].oldLevel = dimmerMap[dimmer].level;
                dimmerMap[dimmer].level = dimup(dimmerMap[dimmer].level);
                break;

            case 'dimdown':
            case '14':
                if (dimmerMap[dimmer].level === 0) {
                    if ((Date.now() - dimmerMap[dimmer].ts) > 400) {
                        dimmerMap[dimmer].lastDir = 'up';
                        dimmerMap[dimmer].level = 100;
                    }
                } else {
                    dimmerMap[dimmer].lastDir = 'down';
                    dimmerMap[dimmer].oldLevel = dimmerMap[dimmer].level;
                    dimmerMap[dimmer].level = dimdown(dimmerMap[dimmer].level);
                }
                break;

            case 'dimupdown':
            case '15':
                if (dimmerMap[dimmer].dimwait > 0) {
                    if ((Date.now() - dimmerMap[dimmer].ts) > 400) {
                        dimmerMap[dimmer].dimwait = 0;
                    } else if (Date.now() < dimmerMap[dimmer].dimwait) {
                        break;
                    }
                }

                if (dimmerMap[dimmer].lastcmd === 'dimupdown' && (Date.now() - dimmerMap[dimmer].ts) > 400) {
                    if (dimmerMap[dimmer].lastDir = 'up') {
                        dimmerMap[dimmer].lastDir === 'down';
                    } else {
                        dimmerMap[dimmer].lastDir = 'up';
                    }
                }

                if (dimmerMap[dimmer].level <= 6) {
                    dimmerMap[dimmer].lastDir = 'down';
                } else if (dimmerMap[dimmer].level >= 100) {
                    dimmerMap[dimmer].lastDir = 'up';
                }

                if (dimmerMap[dimmer].lastDir === 'down') {
                    dimmerMap[dimmer].level = dimup(dimmerMap[dimmer].level);
                } else {
                    dimmerMap[dimmer].level = dimdown(dimmerMap[dimmer].level);
                }

                if (dimmerMap[dimmer].level <= 6 || dimmerMap[dimmer].level >= 100) {
                    dimmerMap[dimmer].dimwait = Date.now() + 800;
                }

                break;
            default:
        }

        dimmerMap[dimmer].ts = Date.now();
        dimmerMap[dimmer].lastcmd = cmd;
        return true;
    }
}

function quantize(level) {
    if (level <= 0) {
        return 0;
    } else if (level <= 6) {
        return 6;
    } else if (level <= 12) {
        return 12;
    } else if (level <= 18) {
        return 18;
    } else if (level <= 25) {
        return 25;
    } else if (level <= 31) {
        return 31;
    } else if (level <= 37) {
        return 37;
    } else if (level <= 43) {
        return 43;
    } else if (level <= 50) {
        return 50;
    } else if (level <= 56) {
        return 56;
    } else if (level <= 62) {
        return 62;
    } else if (level <= 68) {
        return 68;
    } else if (level <= 75) {
        return 75;
    } else if (level <= 81) {
        return 81;
    } else if (level <= 87) {
        return 87;
    } else if (level <= 93) {
        return 93;
    } else {
        return 100;
    }
}

function dimup(level) {
    if (level < 6) {
        return 6;
    } else if (level < 12) {
        return 12;
    } else if (level < 18) {
        return 18;
    } else if (level < 25) {
        return 25;
    } else if (level < 31) {
        return 31;
    } else if (level < 37) {
        return 37;
    } else if (level < 43) {
        return 43;
    } else if (level < 50) {
        return 50;
    } else if (level < 56) {
        return 56;
    } else if (level < 62) {
        return 62;
    } else if (level < 68) {
        return 68;
    } else if (level < 75) {
        return 75;
    } else if (level < 81) {
        return 81;
    } else if (level < 87) {
        return 87;
    } else if (level < 93) {
        return 93;
    } else {
        return 100;
    }
}

function dimdown(level) {
    if (level > 93) {
        return 93;
    } else if (level > 87) {
        return 87;
    } else if (level > 81) {
        return 81;
    } else if (level > 75) {
        return 75;
    } else if (level > 68) {
        return 68;
    } else if (level > 62) {
        return 62;
    } else if (level > 56) {
        return 56;
    } else if (level > 50) {
        return 50;
    } else if (level > 43) {
        return 43;
    } else if (level > 37) {
        return 37;
    } else if (level > 31) {
        return 31;
    } else if (level > 25) {
        return 25;
    } else if (level > 18) {
        return 18;
    } else if (level > 12) {
        return 12;
    } else {
        return 6;
    }
}

function map(topic) {
    return topicMap[topic] || topic;
}

function watchdogTrigger() {
    if (config.watchdog > 0) {
        if (watchdogTriggered) {
            log.error('Watchdog time is up for another period, exiting');
            stop();
        } else {
            log.warn('Watchdog time is up, no data from cul for watchdog time. Trying to read dummy value.');
            cul.write("V");
            watchdogTriggered = true;
            watchdogReload();
        }
    }
}

function watchdogReload() {
    if (config.watchdog > 0) {
        log.debug('Watchdog reloaded');
        clearTimeout(watchdogTimer);
        watchdogTimer = setTimeout(watchdogTrigger, config.watchdog * 1000);
    }
}

function watchdogInit() {
    if (config.watchdog > 0) {
        log.debug('Watchdog initialized');
        watchdogTimer = setTimeout(watchdogTrigger, config.watchdog * 1000);
    }
}

function postConnected() {
    if (mqttConnected) {
        if (culConnected) {
            mqtt.publish(config.name + '/connected', '2', { retain: true, qos: config.mqttQos });
        } else {
            mqtt.publish(config.name + '/connected', '1', { retain: true, qos: config.mqttQos });
        }
    } else {
        mqtt.publish(config.name + '/connected', '0', { retain: true, qos: config.mqttQos });
    }
}

function stop() {
    process.exit(1);
}
