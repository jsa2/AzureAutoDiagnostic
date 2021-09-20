

const getToken = require('../token')


module.exports = async function (context, req) {
   
    console.log(process.env)
    
    // Get token for Azure Management 
    var token = await getToken('https://management.azure.com').catch((error) =>
    {
        console.log('errorDas',error?.statustext, error?.data)

        context.res = {
            // status: 200, /* Defaults to 200 */
            body: error || 'no token'
        }
        return context.done()
    })

    console.log('this is supposed to be error')
    context.res = {
        // status: 200, /* Defaults to 200 */
        body: token || 'no token'
    };
}