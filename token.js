const {axiosClient} = require('./axioshelpers')

var url = "url for the testmsi endpoing, exampl: https://func-msi-giver.azurewebsites.net/api/testmsi?"

module.exports = async function (resource) {

    if (!process.env['MSI_ENDPOINT']) {

        var options = {
           url,
        }
        
       var data = await axiosClient(options)

       return data?.data

    } else {
        var options = {
            url: `${process.env['MSI_ENDPOINT']}?resource=${resource}&api-version=2019-08-01`,
            headers:{
            "X-IDENTITY-HEADER":process.env['IDENTITY_HEADER']
            },
            method:"get"
        }
        
        var data = await(axiosClient(options)).catch((error) => {
            
            return Promise.reject(error?.data)
        })
    
        return data?.data
    }
    
}