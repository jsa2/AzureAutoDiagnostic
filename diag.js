

var axios = require('axios')

async function createDiagnostics(token, workspaceId, item) {


    console.log('checking', item)

    var responseObject  = []

   /*  if (item.match('[Microsoft.Sql/servers/]')) {
        item = `${item}/databases/master` 
    } */

        var opt = {
            url:`https://management.azure.com${item}/providers/Microsoft.Insights/diagnosticSettingsCategories?api-version=2017-05-01-preview`,
            method:"get",
            headers:{
                authorization: "Bearer " + token['access_token']
            }
        }

        var eligibleLogCategories = await axios(opt).catch((error) => {
           
            console.log(error?.response?.data)
                
            })
    
    
            if(eligibleLogCategories?.data) {
                var categories = eligibleLogCategories?.data?.value.filter(cat => {
                    return cat?.properties?.categoryType !== "Metrics"
                } )
            }
    
        

            if (categories?.length > 0) {
                //Checks if there is existing settings, and the resource supports diagnostic settings
                console.log(categories)
                opt.url = `https://management.azure.com${item}/providers/Microsoft.Insights/diagnosticSettings?api-version=2017-05-01-preview`

                var diag = await axios(opt).catch((error) => {
                console.log(error?.response?.data)
                //return Promise.reject(error?.response?.data)
            })
            }
            
    
          // Create diagnostic setting if one does not exist
             if (diag?.data?.value.length == 0 && categories?.length > 0) {
                console.log('checking', item)
          
               var logs = []
                for await (let category of categories) {

                    
                    logs.push({
                            "category":category.name ,
                            "enabled": true,
                            "retentionPolicy": {
                              "enabled": false,
                              "days": 0
                            }
                    })

                    
                }

                opt.url = `https://management.azure.com/${item}/providers/Microsoft.Insights/diagnosticSettings/createdByAutomation?api-version=2017-05-01-preview`
                opt.method ="put"
                opt.data = {
                    "properties": {
                        workspaceId,
                        logs,
                    }
                }

               // console.log(opt)

            var ht=    await axios(opt).catch((error) => {
                console.log(error?.response?.data)
                })

                if(ht?.data) {
                    responseObject.push(ht?.data)
                }

                }

   

    return Promise.resolve('writeHEre',responseObject)

}

module.exports={createDiagnostics}
