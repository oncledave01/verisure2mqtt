// const Verisure = require('verisure');
const mqtt = require('mqtt');
var asyncInterval = require('asyncinterval');
const axios = require('axios');
const VerisureInstallation = require('./installation');

const AUTH_HOSTS = [
    'm-api01.verisure.com',
    'm-api02.verisure.com',
  ];
  
  const HOSTS = [
    'e-api01.verisure.com',
    'e-api02.verisure.com',
  ];
  

// Set to true to output all received info to console.
// False will limit output to only mention that a query to the Verisure API is made
const flagDebug = process.env.VERISURE_DEBUG == 'true' ? true : false;

// Read config and secrets from environment variables
const config = {
    sw_version: 'verisure2mqtt v0.4',
    verisureUsername: process.env.VERISURE_USERNAME,
    verisurePwd: process.env.VERISURE_PWD,
    mqttBrokerHost: process.env.MQTT_BROKER_HOST,
    mqttBrokerPort: process.env.MQTT_BROKER_PORT,
    mqttBrokerUsername: process.env.MQTT_BROKER_USERNAME,
    mqttBrokerPwd: process.env.MQTT_BROKER_PWD,
    mqttRootTopic:
        process.env.MQTT_ROOT_TOPIC.substr(process.env.MQTT_ROOT_TOPIC.length - 1) == '/'
            ? process.env.MQTT_ROOT_TOPIC.substr(0, process.env.MQTT_ROOT_TOPIC.length - 1)
            : process.env.MQTT_ROOT_TOPIC,
};

const discovery_prefix = 'homeassistant';
const verisure_prefix = 'verisure';

const options = {
    port: process.env.MQTT_BROKER_PORT,
    host: process.env.MQTT_BROKER_HOST,
    clientID: process.env.MQTT_BROKER_USERNAME,
    username: process.env.MQTT_BROKER_USERNAME,
    password: process.env.MQTT_BROKER_PWD,
    will: 
	{
	topic: `verisure/bridge/state`,
	payload: `offline`,
	retain: true,
	}
}



if (flagDebug) {
    console.log(`Verisure username: ${config.verisureUsername}`);
    console.log(`Verisure pwd: ${config.verisurePwd}`);
    console.log(`MQTT host: ${config.mqttBrokerHost}`);
    console.log(`MQTT host port: ${config.mqttBrokerPort}`);
    console.log(`MQTT host username: ${config.mqttBrokerUsername}`);
    console.log(`MQTT host pwd: ${config.mqttBrokerPwd}`);
    console.log(`MQTT root topic: ${config.mqttRootTopic}`);
}

var firstRun = true;

var mqttClient = mqtt.connect(`mqtt://${config.mqttBrokerHost}:${config.mqttBrokerPort}`, options);

mqttClient.on('connect', function () {
    mqttClient.subscribe(
        `${config.mqttRootTopic}/status/services/verisure2mqtt-bridge`,
        function (err) {
            if (!err) {
                mqttClient.publish(
                    `${verisure_prefix}/bridge/config`,
                    `{"version": "${config.sw_version}"}`,
                );
                mqttClient.publish(
                    `${verisure_prefix}/bridge/state`,
                    'online',
                    {
                        retain: true,
					},
                );
            }
        },
    );
    var overview = getVerisure();
});


// Handle errors

mqttClient.on('error', function () {
    console.log(`Error cannot connect to MQTT host ${config.mqttBrokerHost}`);
});

// Treat received messages
mqttClient.on('message', function (topic, message, packet) {
    switch (message.toString()) {
	  case "update":
	    console.log('update requested by MQTT');
		var overview = getVerisure();
		break;
	  case `restart`:
	  case 'restart':
	    console.log('restart requested by MQTT');
		break;
      default:
	    console.log(`Unknown message received ${message}`);
	}
});

function wait(timeout) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, timeout);
    });
}




function getVerisure() {
    try {
        const verisure = new Verisure(config.verisureUsername, config.verisurePwd);
        verisure
            .getToken()
            .then(() => {
                return verisure.getInstallations();
            })
            .then(installations => {
                return installations[0].getOverview();
            })
            .then(overview => {
                console.log(`${new Date()} : Polling Verisure API...`);

                if (flagDebug) {
                    console.log('OVERVIEW:', overview);
                }
                
                if (firstRun) {
                    // Overall alarm state
                          autodiscover_msg = {
						  "value_template":`{{ value_json.statusType.lower() }}`,
						  "state_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/armState/STATE`,
						  "json_attributes_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/armState/STATE`,
						  "command_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/armState/SET`,
						  "name":"Verisure_alarm",
						  "unique_id":"1234_5678",
						  "device":
						  {
							"identifiers":[
							  "1234_5678"
							],
							"name":"Verisure_alarm",
							"sw_version":`${config.sw_version}`,
							"model":"Verisure Alarm",
							"manufacturer":"Verisure"
						  },
						  "availability_topic":"verisure/bridge/state"
					}
					mqttClient.publish(
						`${discovery_prefix}/alarm_control_panel/Verisure_alarm/config`,
						JSON.stringify(autodiscover_msg),
						{
							retain: true,
						},
					);
                    // Environmental values
					if ( typeof overview.climateValues !== 'undefined' && overview.climateValues )
					{
						overview.climateValues.forEach(climateValue => {
						    switch (climateValue.deviceType.toString()) {
						        case "SMOKE2":
						        case "HUMIDITY1":
									autodiscover_msg = {
									  "value_template":"{{ value_json.humidity }}",
									  "state_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/${climateValue.deviceArea}/SENSOR`,
									  "json_attributes_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/${climateValue.deviceArea}/SENSOR`,
									  "name":`${climateValue.deviceArea}_humidity`,
									  "unique_id":`${climateValue.deviceLabel.replace(' ','_')}_1`,
									  "unit_of_measurement": "%",
									  "device":
									  {
										  "identifiers": [
											`${climateValue.deviceLabel.replace(' ','_')}_1`
										  ],
										  "name":`${climateValue.area}`,
										  "sw_version":`${config.sw_version}`,
										  "model":"Verisure climate sensor",
										  "manufacturer":"Verisure"
									  },
									  "availability_topic":"verisure/bridge/state"
									}
							
									mqttClient.publish(
								`${discovery_prefix}/sensor/${climateValue.deviceLabel.replace(' ','_')}/humidity/config`,
								JSON.stringify(autodiscover_msg),
								{
									retain: true,
								},
									);

						        default:
									autodiscover_msg = {
									  "value_template":"{{ value_json.temperature }}",
									  "state_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/${climateValue.deviceArea}/SENSOR`,
									  "json_attributes_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/${climateValue.deviceArea}/SENSOR`,
									  "name":`${climateValue.deviceArea}_temperature`,
									  "unique_id":`${climateValue.deviceLabel.replace(' ','_')}_2`,
									  "unit_of_measurement": "�C",
									  "device":
									  {
										  "identifiers": [
											`${climateValue.deviceLabel.replace(' ','_')}_2`
										  ],
										  "name":`${climateValue.area}`,
										  "sw_version":`${config.sw_version}`,
										  "model":"Verisure climate sensor",
										  "manufacturer":"Verisure"
									  },
									  "availability_topic":"verisure/bridge/state"
									}
							
									mqttClient.publish(
								`${discovery_prefix}/sensor/${climateValue.deviceLabel.replace(' ','_')}/temperature/config`,
								JSON.stringify(autodiscover_msg),
								{
									retain: true,
								},
									);
							}
						});
					}
                
                    // Door/window devices
					if ( typeof overview.doorWindow.doorWindowDevice !== 'undefined' && overview.doorWindow.doorWindowDevice )
					{
						overview.doorWindow.doorWindowDevice.forEach(doorWindow => {
							autodiscover_msg = {
							  "payload_on":"OPEN",
							  "payload_off":"CLOSE",
							  "value_template":"{{ value_json.state }}",
							  "device_class":"door",
							  "state_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/${doorWindow.area}/STATE`,
							  "json_attributes_topic":`${config.mqttRootTopic}/${verisure_prefix}/tele/${doorWindow.area}/STATE`,
							  "name":`${doorWindow.area}`,
							  "unique_id":`${doorWindow.deviceLabel.replace(' ','_')}`,
							  "device":
							  {
								  "identifiers": [
									`${doorWindow.deviceLabel.replace(' ','_')}`
								  ],
								  "name":`${doorWindow.area}`,
								  "sw_version":`${config.sw_version}`,
								  "model":"Verisure door sensor",
								  "manufacturer":"Verisure"
							  },
							  "availability_topic":"verisure/bridge/state"
							}

							mqttClient.publish(
								`${discovery_prefix}/binary_sensor/${doorWindow.deviceLabel.replace(' ','_')}/config`,
								JSON.stringify(autodiscover_msg),
								{
									retain: true,
								},
							);
						});
					}
					
					firstRun = false;
                }

                // Overall alarm state
                mqttClient.publish(
                    `${config.mqttRootTopic}/${verisure_prefix}/tele/armState/STATE`,
                    JSON.stringify(overview.armState),
                    {
                        retain: true,
                    },
                );

                // Alarm state compatible
                //mqttClient.publish(
                //    `${config.mqttRootTopic}/${verisure_prefix}/tele/armstateCompatible/STATE`,
                //    overview.armstateCompatible.toString(),
                //);

                // Control plugs
                //overview.controlPlugs.forEach(controlPlug => {
                //    mqttClient.publish(
                //        `${config.mqttRootTopic}/${verisure_prefix}/tele/controlPlug/STATE`,
                //        JSON.stringify(controlPlug),
                //    );
                //});

                // Smart plugs
                if ( typeof overview.smartPlugs !== 'undefined' && overview.smartPlugs )
                {
                    overview.smartPlugs.forEach(smartPlug => {
                        mqttClient.publish(
                            `${config.mqttRootTopic}/${verisure_prefix}/tele/${smartPlug.area}/STATE`,
                            JSON.stringify(smartPlug),
                        );
                    });
                }

                // Door locks
                //overview.doorLockStatusList.forEach(doorLock => {
                //    mqttClient.publish(
                //        `${config.mqttRootTopic}/${verisure_prefix}/tele/doorLock/STATE`,
                //        JSON.stringify(doorLock),
                //    );
                //});

                // SMS count
                //mqttClient.publish(
                //    `${config.mqttRootTopic}/${verisure_prefix}/tele/totalSmsCount/STATE`,
                //    overview.totalSmsCount.toString(),
                //);

                // Environmental values
                if ( typeof overview.climateValues !== 'undefined' && overview.climateValues )
                {
                    overview.climateValues.forEach(climateValue => {
                        mqttClient.publish(
                            `${config.mqttRootTopic}/${verisure_prefix}/tele/${climateValue.deviceArea}/SENSOR`,
                            JSON.stringify(climateValue),
                        );
                    });
                }

                // Error list
                if ( typeof overview.installationErrorList !== 'undefined' && overview.installationErrorList )
                {
				    overview.installationErrorList.forEach(installationError => {
                        mqttClient.publish(
                            `${config.mqttRootTopic}/${verisure_prefix}/tele/${installationError.area}/STATE`,
                            JSON.stringify(installationError),
                        );
                    });
				}

                // Pending changes
                if ( typeof overview.pendingChanges !== 'undefined' && overview.pendingChanges )
                {
                    mqttClient.publish(
                         `${config.mqttRootTopic}/${verisure_prefix}/tele/pendingChanges/STATE`,
                         overview.pendingChanges.toString(),
                    );
                }

                // Ethernet mode active
                if ( typeof overview.ethernetModeActive !== 'undefined' && overview.ethernetModeActive )
				{
				    mqttClient.publish(
                        `${config.mqttRootTopic}/${verisure_prefix}/tele/ethernetModeActive/STATE`,
                        overview.ethernetModeActive.toString(),
                    );
				}

                // Ethernet connected now
                if ( typeof overview.ethernetConnectedNow !== 'undefined' && overview.ethernetConnectedNow )
				{
				    mqttClient.publish(
                        `${config.mqttRootTopic}/${verisure_prefix}/tele/ethernetConnectedNow/STATE`,
                        overview.ethernetConnectedNow.toString(),
                    );
				}


                // Smart Cameras
                // TODO

                // Latest Ethernet status
                if ( typeof overview.latestEthernetStatus  !== 'undefined' && overview.latestEthernetStatus )
				{
				    mqttClient.publish(
                        `${config.mqttRootTopic}/${verisure_prefix}/tele/latestEthernetStatus/STATE`,
                        JSON.stringify(overview.latestEthernetStatus),
                    );
				}

                // Customer image cameras
                // TODO

                // Battery process
                if ( typeof overview.batteryProcess !== 'undefined' && overview.batteryProcess )
                {
                    mqttClient.publish(
                        `${config.mqttRootTopic}/${verisure_prefix}/tele/batteryProcess/STATE`,
                        JSON.stringify(overview.batteryProcess),
                    );
                }

                // User tracking status
                //mqttClient.publish(
                //    `${config.mqttRootTopic}/${verisure_prefix}/tele/userTrackingStatus/STATE`,
                //    overview.userTracking.installationStatus.toString(),
                //);

                // User tracking
                //overview.userTracking.users.forEach(user => {
                //    mqttClient.publish(
                //        `${config.mqttRootTopic}/${verisure_prefix}/tele/userTracking/STATE`,
                //        JSON.stringify(user),
                //    );
                //});

                // Event counts
                // TODO

                // Door/window report state
                if ( typeof overview.doorWindow.reportState !== 'undefined' && overview.doorWindow.reportState )
                {
                    mqttClient.publish(
                        `${config.mqttRootTopic}/${verisure_prefix}/tele/doorWindowReportState/STATE`,
                        overview.doorWindow.reportState.toString(),
                    );
                 }

                // Door/window devices
                if ( typeof overview.doorWindow.doorWindowDevice !== 'undefined' && overview.doorWindow.doorWindowDevice )
                {
                    overview.doorWindow.doorWindowDevice.forEach(doorWindow => {
                        mqttClient.publish(
                            `${config.mqttRootTopic}/${verisure_prefix}/tele/${doorWindow.area}/STATE`,
                            JSON.stringify(doorWindow),
                        );
                    });
                }
            })
            .catch(error => {
                console.error('Error 1: ', error);
            });
    } catch (err) {
        console.log('Error 2: ', err.message);
    }
}

// Pull data from Verisure API every 10 minutes
var interval = asyncInterval(
    async function (done) {
        // We only enter here one call at a time.
        var overview = await getVerisure();

        // After we finish our async function, let asyncInterval know
        // This will tell asyncInterval to schedule the next interval
        done();
    },
    600000,
    650000,
);

// optional timeout
interval.onTimeout(function () {
    console.log('XXXXXXXXXXXXXXXXXXXXXXXX');
    console.log('Timeout!');
    console.log('XXXXXXXXXXXXXXXXXXXXXXXX');
});

class Verisure {
    constructor(email, password, cookies = []) {
      [this.host] = HOSTS;
      [this.authHost] = AUTH_HOSTS;
      this.email = email;
      this.password = password;
      this.promises = {};
      this.cookies = cookies;
    }
  
    async makeRequest(options, retrying = false) {
      const isAuth = options.url.startsWith('/auth');
  
      if (retrying) {
        if (isAuth) {
          this.authHost = AUTH_HOSTS[+!AUTH_HOSTS.indexOf(this.authHost)];
        } else {
          this.host = HOSTS[+!HOSTS.indexOf(this.host)];
        }
      }
  
      const request = {
        ...options,
        baseURL: isAuth
          ? `https://${this.authHost}/`
          : `https://${this.host}/xbn/2/`,
        headers: {
          'User-Agent': 'node-verisure',
          accept: 'application/json',
          ...(options.headers || {}),
        },
      };
  
      if (this.cookies) {
        request.headers.Cookie = this.cookies.join(';');
      }
  
      try {
        return await axios(request);
      } catch (error) {
        if (error.response && error.response.status > 499 && !retrying) {
          return this.makeRequest(options, true);
        }
  
        throw error;
      }
    }
  
    client(request) {
      const requestRef = JSON.stringify(request);
      let promise = this.promises[requestRef];
      if (promise) {
        return promise;
      }
  
      promise = this.makeRequest(request)
        .then(({ data }) => {
          delete this.promises[requestRef];
          return data;
        })
        .catch((error) => {
          delete this.promises[requestRef];
          return Promise.reject(error);
        });
  
      this.promises[requestRef] = promise;
      return promise;
    }
  
    getCookie(prefix) {
      return this.cookies.find((cookie) => cookie.startsWith(prefix));
    }
  
    async getToken(code) {
      let authRequest = {
        method: 'post',
        url: '/auth/login',
        auth: {
          username: this.email,
          password: this.password,
        },
      };
  
      if (code) {
        // 2. Continue MFA flow, send code.
        authRequest = {
          method: 'post',
          url: '/auth/mfa/validate',
          data: { token: code },
        };
      }
  
      const { headers } = await this.makeRequest(authRequest);
  
      const cookies = headers['set-cookie'];
  
      this.cookies = cookies && cookies.map((cookie) => cookie.split(';')[0]);
  
      if (this.getCookie('vs-stepup')) {
        // 1. Start MFA flow, request code.
        await this.makeRequest({
          method: 'post',
          url: '/auth/mfa',
        });
      }
  
      return this.cookies;
    }
  
    getInstallations() {
      return this.client({ url: `/installation/search?email=${this.email}` })
        .then((installations) => installations
          .map((installation) => new VerisureInstallation(installation, this.client.bind(this))));
    }
  }