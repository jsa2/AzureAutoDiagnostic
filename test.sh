# Force triggers by deployment and restarts
i=0
while [ -z "$fnTrues" ] ; do
((i++))
echo "attempting to sync triggers $C/$E"
 if [[ $i -eq 2 ]]; then
    break  
    fi
done