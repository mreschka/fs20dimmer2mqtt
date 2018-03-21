# fs20dimmer2mqtt

[![mqtt-smarthome](https://img.shields.io/badge/mqtt-smarthome-blue.svg)](https://github.com/mqtt-smarthome/mqtt-smarthome)
[![NPM version](https://badge.fury.io/js/fs20dimmer2mqtt.svg)](http://badge.fury.io/js/fs20dimmer2mqtt)
[![License][mit-badge]][mit-url]

> A deamon for tracking FS20 dimmer commands to mqtt following the [mqtt-smarthome](https://github.com/mqtt-smarthome) architecure.

Based on the idea of [mqtt-smarthome](https://github.com/mqtt-smarthome) and especially on the work of hobbyquaker [hm2mqtt.js](https://github.com/hobbyquaker/hm2mqtt.js).

This deamon tries to behave as ELV FS20 dimmer actuators do. Actually it's not 100% accurate, so it won't work to guess the dimlevel all the time.

The idea was to us FS20 wall switches etc. to control other (non-FS20) dimmers light lightify or hue lamps. In my case I use openhab2 to control the lamps based on the output of this module.

Please read the --help output for commandline options. I tried to stick as close as possible to hm2mqtt.js.

## Install

`sudo npm install -g fs20dimmer2mqtt`

As hobbyquaker I also suggest to use pm2 to manage the fs20dimmer2mqtt process (start on system boot, manage log files, ...). There is a really good howto at the [mqtt-smarthome repo](https://github.com/mqtt-smarthome/mqtt-smarthome/blob/master/howtos/homematic.md)

## Usage

`fs20dimmer2mqtt --help`

```fs20dimmer2mqtt 0.0.1
FS20 dimmer tracker to mqtt-smarthome daemon.

Usage: index.js [options]

Options:
  -v, --verbosity            possible values: "error", "warn", "info", "debug"
                                                               [default: "info"]
  -c, --cul-connection-mode  cul connection mode
  --cul-serialport           cul serialport (if serial)
  --cul-baudrate             cul baudrate (if serial)                   [number]
  --cul-coc                  has to be enabled for usage with COC, changes
                             default baudrate to 38400 and default serialport to
                             /dev/ttyACM0                              [boolean]
  --cul-scc                  cul has to be enabled for usage with SCC, changes
                             default baudrate to 38400 and default serialport to
                             /dev/ttyAMA0                              [boolean]
  --cul-host                 cul hostname if telnet
  --cul-port                 cul port if telnet                         [number]
  --cul-no-network-timeout   disabling sending keep alive signals if telnet
                                                                       [boolean]
  --fs20-map                 file containing name mappings from FS20 adresses to
                             name
  -h, --help                 Show help                                 [boolean]
  --version                  Show version number                       [boolean]
  -m, --mqtt-url             mqtt broker url. See
                             https://github.com/mqttjs/MQTT.js#connect
                                                   [default: "mqtt://127.0.0.1"]
  -n, --name                 instance name. used as mqtt client id and as prefix
                             for connected topic         [default: "fs20dimmer"]
  -p, --mqtt-password        mqtt broker password
  -q, --mqtt-qos             mqtt qos setting              [number] [default: 0]
  -r, --mqtt-no-retain       disable mqtt retain                       [boolean]
  -s, --json-values          Publish values on status at mqtt as json including
                             additional info                           [boolean]
  -u, --mqtt-username        mqtt broker username
  -w, --watchdog             timeout for internal watchdog in seconds (default:
                             0=off)                                 [default: 0]
```
### Examples

* Simple Example, local mqtt server, no auth, np retain, watchdog on:
`/usr/bin/fs20dimmer2mqtt -c telnet --cul-host 192.168.4.30 -r -w 90`
starts the deamon, connects to cuno via telnet at `192.168.4.30` and publishes at `fs20dimmer/status/#` of the local mqtt (port 1883)

* Complex Example, local mqtt server, with auth:
`/usr/bin/helios2mqtt -c telnet --cul-host  192.168.4.30 --cul-port 23 -m mqtt://192.168.4.10 -u f20dimmerMqtt -p seCRe7 -s -v warn -r -w 90 --fs20-map /home/smarthome/fs20-map.json`
starts the deamon, connects to cuno via telnet at `192.168.4.30` with poert 23 and publishes at `fs20dimmer/status/#` of the mqtt server at `192.168.4.10` using the credentials above. Published will be json strings with additional infos. Will only print warning and errors. Uses a map fs20 devices to name using the definition in home of smarthome user.

### mqtt topics

* `fs20dimmer/status/xxx`:
fs20dimmer2mqtt pushes the current dimlevel of each received FS20 device to either fs20dimmer/status/deviceNameFromMApFile or to fs20dimmer/status/FS20/123400 if device does not have a map file. You can choose using -s Option if you would like to simply have the value or a json string with more info like timestamp and explanation.

* `fs20dimmer/get/xxx`:
fs20dimmer2mqtt listens to get requests here. You can request status updates for specific devices here. The response will be published as status.

* `fs20dimmer/connected`:
    * `0` means not connected (using a mqtt will, so this means deamon is not running at all or is not able to connect to mqtt server)
    * `1` means connected to mqtt but no connection to cul
    * `2` means connected to both, mqtt and cul

* `fs20dimmer/set/xxx`:
Can be used for changing the dim level and sending the FS20 command. The published value has to be: on, off or a level in percent [0-100].

### watchdog feature

The watchdog monitors mqtt-publish activity of fs20dimmer2mqtt. I suggest using at least 60 seconds. You can turn this on in order to let fs20dimmer2mqtt exit as a last measure if all reconnect attempts fail (i.e. twice the watchdog time went by without any successful publish. Reasons could for exmaple be a problem with modbus connection to helios and no data from cul or a connection problem to mqtt server. Use witch care - you have to make sure the process gets restarted after it exits, e.g. using pm2 or similar.

## License

MIT © [Markus Reschka](https://github.com/mreschka)

[mit-badge]: https://img.shields.io/badge/License-MIT-blue.svg?style=flat
[mit-url]: LICENSE

## Credits

Thanks to [hobbyquaker](https://github.com/hobbyquaker) for your work on smarthome and hm2mqtt! This work is based on your ideas. First start for this was [xyz2mqtt-skeleton](https://github.com/hobbyquaker/xyz2mqtt-skeleton).
