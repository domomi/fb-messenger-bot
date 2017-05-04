var airportsService = require('./airports-service');
// var database = require('./firebase-config.js');
var flightsService = require('./flights-data-service');
var messagingService = require('./messaging-service');
var templatizer = require('./templatizer');

// setup express
var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');

// load request
var request = require('request');

// load valid US airport codes for validation
var fs = require("fs");
var buffer = fs.readFileSync("./airport-codes.dat");
var airportCodes = buffer.toString().split("\n");

//register endpoints
var app = express();
app.use(bodyParser.json());
app.use(cors());

// properties
var listSize = 4; // max value allowed in list is 4
var PAGE_ACCESS_TOKEN = "EAAKNgXSzsvABAOrhZBc5LZBbYoJWiIPxZCSjpRmZCt0AzWgVxLdxWGXnD74wgh4MbmJOwYwQKH9l4UjHjZBFlFPTtKb91lcdh97qlpGKlCBJtU9DLBOAlb9aphaatrjAsh6odjVAZCZClbGTzLjIUXxdZCmCXjccqjm4lAK2PabO6AZDZD";

// map to hold a user and their origins
var userOriginsMap = {}

// GET /webhook
app.get('/webhook', function (req, res) {
    console.log("subscribing via webhook");
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === "cooking_with_the_sauce") {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    } 
    else {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);          
    }

});

// POST /webhook
app.post('/webhook', function (req, res) {
    var data = req.body;

  if (data.object === 'page') {
    // Iterate over each entry - there may be multiple if batched
    data.entry.forEach(function(entry) {
        var pageID = entry.id;
        var timeOfEvent = entry.time;
        entry.messaging.forEach(function(event) {
            if (event.message) {
                try{
                    processMessage(event);
                }
                catch(err){
                    console.log(err);
                }
            } 
            else {
                console.log("Webhook received unknown event: ", event);
            }
        });
    });
    res.sendStatus(200);
  }
});

function processMessage(event){
    var senderID = event.sender.id;
    var recipientID = event.recipient.id;
    var timeOfMessage = event.timestamp;
    var message = event.message;

    console.log("Received message for user %d and page %d at %d with message:", senderID, recipientID, timeOfMessage);
    console.log(JSON.stringify(message));

    var messageId = message.mid;

    var messageText = message.text;
    var messageAttachments = message.attachments;

    var messageData = {};
    messageData.recipient = {id : senderID};

    if (messageText) {

        // initialize this user in map
        if(!(senderID in userOriginsMap)){
            userOriginsMap[senderID] = [];
        }

        switch (messageText) {

            case 'help':
                messageData.message = {text: "Type your nearest airport code to get started (i.e. 'JFK')\nType 'clear' to start over\nType 'flights' to start your search"};
                callSendAPI(messageData);
            break

            case 'clear':
                userOriginsMap[senderID] = []
                messageData.message = {text: "Starting from scratch! Send us your nearest airport code to get started!"};
                callSendAPI(messageData);
            break
            
            case 'flights':
                if(userOriginsMap[senderID].length>0){
                    var promise = flightsService.getTrips(userOriginsMap[senderID],'US');
                    promise.then(function(data){
                        var message = templatizer.generateListTemplateMessage(data, listSize);
                        messageData.message = message;
                        callSendAPI(messageData);
                    });
                }
                else{
                    messageData.message = {text: "Before we can search, let us know your nearest airport code (i.e. 'SFO')"};
                    callSendAPI(messageData);
                }
            break;

            // user is likely inputting an airport code
            default:
                if(validateAirportCode(messageText)){
                    messageText = messageText.toUpperCase();
                    userOriginsMap[senderID].push(messageText);
                    messageData.message = {text: `Awesome! I see you're coming from ${JSON.stringify(userOriginsMap[senderID])}, anywhere else? When you're ready, just type 'flights'`}
                }
                else{
                    messageData.message = {text: "Sorry, I didn't get that! Just type your nearest airport code! When you're ready to search, just type 'flights'"};
                }
                callSendAPI(messageData);
        }
    }
}


// GET /
app.get('/', function(req, res){
    res.send("hello facebook bot");
});

app.listen(8080, function () {
  console.log('FbM bot started on port 8080');
});

/*
* Send flight messages to a single group
* @groupId group to send flights to
* @destination 'international' or 'domestic'
*/
function sendFlightsMessageToGroup(groupId, destination){
    database.ref('/groups/'+groupId).once('value').then(function(groupSnapshot) {
        database.ref('/airports').once('value').then(function(airportsSnapshot) {
          var group = groupSnapshot.val();
          var airportUserMapping = airportsSnapshot.val();
            var origins = [];
            for(var i=0;i<group.length;i++){
              var member=group[i];
              if(airportUserMapping[member]){
                origins.push(airportUserMapping[member]);
              }
            }
            var promises = flightsService.getTrips(origins,destination);
            messagingService.sendFlightResultsToGroup(promises,groupId);
        });
    });
}


function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      console.log("Successfully sent message with id %s to recipient %s", 
        messageId, recipientId);
    } else {
      console.error("Unable to send message.");
      console.error(error);
    }
  });  
}

function validateAirportCode(code){
    return airportCodes.indexOf(code.toUpperCase()) > -1;
}