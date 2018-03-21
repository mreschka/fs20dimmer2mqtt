var pkg = require('./package.json');
var config = require('yargs')
    .usage(pkg.name + ' ' + pkg.version + '\n' + pkg.description + '\n\nUsage: $0 [options]')
    .describe('v', 'possible values: "error", "warn", "info", "debug"')
    .describe('name', 'instance name. used as mqtt client id and as prefix for connected topic')
    .describe('mqtt-url', 'mqtt broker url. See https://github.com/mqttjs/MQTT.js#connect')
    .describe('mqtt-username', 'mqtt broker username')
    .describe('mqtt-password', 'mqtt broker password')
    .describe('mqtt-no-retain', 'disable mqtt retain')
    .describe('mqtt-qos', 'mqtt qos setting')
    .describe('cul-connection-mode', 'cul connection mode')
    .describe('cul-serialport', 'cul serialport (if serial)')
    .describe('cul-baudrate', 'cul baudrate (if serial)')
    .describe('cul-coc', 'has to be enabled for usage with COC, changes default baudrate to 38400 and default serialport to /dev/ttyACM0')
    .describe('cul-scc', 'cul has to be enabled for usage with SCC, changes default baudrate to 38400 and default serialport to /dev/ttyAMA0')
    .describe('cul-host', 'cul hostname if telnet')
    .describe('cul-port', 'cul port if telnet')
    .describe('cul-no-network-timeout', 'disabling sending keep alive signals if telnet')
    .describe('fs20-map', 'file containing name mappings from FS20 adresses to name')
    .describe('json-values', 'Publish values on status at mqtt as json including additional info')
    .describe('watchdog', 'timeout for internal watchdog in seconds (default: 0=off)')
    .describe('h', 'show help')
    .boolean('json-values')
    .boolean('mqtt-no-retain')
    .boolean('cul-coc')
    .boolean('cul-scc')
    .boolean('cul-no-network-timeout')
    .number('mqtt-qos')
    .number('cul-port')
    .number('cul-baudrate')
    .choices('mqtt-qos', [0, 1, 2])
    .choices('cul-connection-mode', ['serial','telnet'])
    .alias({
        'c': 'cul-connection-mode',
        'h': 'help',
        'm': 'mqtt-url',
        'n': 'name',
        'p': 'mqtt-password',
        'q': 'mqtt-qos',
        'r': 'mqtt-no-retain',
        's': 'json-values',
        'u': 'mqtt-username',
        'w': 'watchdog',
        'v': 'verbosity'
    })
    .default({
        'm': 'mqtt://127.0.0.1',
        'n': 'fs20dimmer',
        'q': 0,
        'w': 0,
        'v': 'info'
    })
    .version()
    .help('help')
    .argv;

module.exports = config;
