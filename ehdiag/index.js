
const getToken = require('../token')
const {createDiagnostics} = require('../diag')
var {workspaceId} = process.env

if (!process.env['MSI_ENDPOINT']) {
 workspaceId = "enter wsid"
}

module.exports = async function (context, eventHubMessages) {


    context.log('initated! ', JSON.stringify(eventHubMessages))

    // Get token for Azure Management 
    var token = await getToken('https://management.azure.com').catch((error) =>
    {
        console.log(error)
        return context.done()
    })

  
    //preIterate 
    try {
    for await (let message of eventHubMessages) {
    for await (record of message?.records) { }}
    } catch(error) {
        console.log('not iterable', eventHubMessages)
        return context.done()
    }   
    
  
    for await (let message of eventHubMessages) {

        for await (record of message?.records) {
            
            console.log(record?.operationName)

            if ( record?.operationName.match('WRITE') 
                && record.resultType == "Success" 
                && !record?.operationName.match('DEPLOYMENTS') 
                && !record?.operationName.match('INSIGHTS')  ) {
                context.log('initated resource check ', JSON.stringify(eventHubMessages))
               await createDiagnostics(token, workspaceId, record?.resourceId).catch((error) => {
                    console.log(error) })
                

            }

        }

    }
        //var msg = JSON.parse(message?.records)
        
            
         
        
    
}; 