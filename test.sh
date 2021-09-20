i=0
while [ -z "$fnTrues" ] ; do
((i++))
az functionapp deployment source config-zip -g $rg -n $fnName --src deploy.zip
sleep 10
fnTrues=$(az functionapp function show -g $rg -n $fnName --function-name ehdiag -o tsv --query "id")
echo "$fnTrues"
echo "attempting to sync triggers $C/$E"
 if [[ $i -eq 6 ]]; then
    break  
    fi
done
