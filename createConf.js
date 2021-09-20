[nan,nan,hub,wsid,str,sta] = process.argv

console.log(str)
var functionjson = {
    "bindings": [
      {
        "type": "eventHubTrigger",
        "name": "eventHubMessages",
        "direction": "in",
        "eventHubName": hub,
        "connection": "AzureEventHubConnectionString",
        "cardinality": "many",
        "consumerGroup": "$Default"
      }
    ]
  }


  var localSettings = {
    "IsEncrypted": false,
    "Values": {
      "AzureWebJobsStorage": sta,
      "FUNCTIONS_WORKER_RUNTIME": "node",
      "AzureEventHubConnectionString": str,
      "FUNCTIONS_EXTENSION_VERSION": "~3",
      "WEBSITE_CONTENTAZUREFILECONNECTIONSTRING":sta,
      "workspaceId": wsid
    }
  }

var fs = require('fs')

fs.writeFileSync('ehdiag/function.json',JSON.stringify(functionjson))

fs.writeFileSync('local.settings.json',JSON.stringify(localSettings))