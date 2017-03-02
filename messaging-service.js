var genieApi = require('genie.apiclient');
var config = require('./config');
var flightsService = require('./flights-data-service');

genieApi.config(config);

var messagingService = {};

messagingService.sendFlightResultsToGroup = function(promises, groupId){
  Promise.all(promises).then(function(rawResults){
    var dests = flightsService.doParsing(rawResults);
    var items = [];
    for(var i=0;i<10;i++){
      dest=dests[i];
      var item = {
        index:i+1,
        title: dest.destinationName,
        description: 'group trips from $'+dest.totalCost,
        on_tap: "useraction://message?text='hello world'&id='abcd'"
      };
      items.push(item);
    }
    var data = {
      text: "Check out these group trips!",
      display_unit: "list",
      payload: {
        items: items
      } 
    };
    genieApi.post('/genies/groups/'+groupId+'/message', data, function(e,r,b){
      console.log("sending message");
    });
  });
}

module.exports = messagingService;