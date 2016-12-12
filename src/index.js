/**
 * Blind Man's Bluff card game for Alexa
 *
 * Usage:
 *  User: "Alexa, play One Card Poker"
 *  [follow prompts]
 */

var APP_ID = "";
var APP_NAME = "One Card Poker";

var CARDS_BASE_URL = "http://deckofcardsapi.com/api/deck";
var VI_APP_TOKEN = "";

var http = require('http');
var async = require('async');
var VoiceInsights = require('voice-insights-sdk');

/**
 * The AlexaSkill prototype and helper functions
 */
var AlexaSkill = require('./AlexaSkill');

var MyApp = function () {
    AlexaSkill.call(this, APP_ID);
};

// Extend AlexaSkill
MyApp.prototype = Object.create(AlexaSkill.prototype);
MyApp.prototype.constructor = MyApp;

MyApp.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
    VoiceInsights.initialize(session, VI_APP_TOKEN);
    console.log("MyApp onSessionStarted requestId: " + sessionStartedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any initialization logic goes here
};

MyApp.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("MyApp onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    newGame(session, response);
};

/**
 * Overridden to show that a subclass can override this function to teardown session state.
 */
MyApp.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
    console.log("MyApp onSessionEnded requestId: " + sessionEndedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any cleanup logic goes here
};

MyApp.prototype.intentHandlers = {
    "PlayIntent": function (intent, session, response) {
        VoiceInsights.track(intent.name);

        if(!session.attributes.deck_id){
            // get a new deck
            newGame(session, response);
        }else{
            // deal the cards
            dealCards(session, response, function(err, result){
                if(err){
                    response.tell(err);
                }else{
                    response.ask(result);
                }
            });
        }
    },

    "YesIntent": function (intent, session, response) {
        VoiceInsights.track(intent.name);

        // player has decided to stay
        var outcome = "";
        var reprompt = "";
        async.waterfall([
            function(callback){
                // evaluate the current hand
                if(cardValueToNumber(session.attributes.player_card.value) > cardValueToNumber(session.attributes.alexa_card.value)){
                    // player wins
                    session.attributes.hands_won += 1;
                    outcome = "You win! Your " + session.attributes.player_card.value.toLowerCase() + " of " + session.attributes.player_card.suit.toLowerCase() + " beats my " + session.attributes.alexa_card.value.toLowerCase() + " of " + session.attributes.alexa_card.suit.toLowerCase() + ".";
                }else if(cardValueToNumber(session.attributes.player_card.value) < cardValueToNumber(session.attributes.alexa_card.value)){
                    // alexa wins
                    session.attributes.hands_lost += 1;
                    outcome = "I win! My " + session.attributes.alexa_card.value.toLowerCase() + " of " + session.attributes.alexa_card.suit.toLowerCase() + " is better than your " + session.attributes.player_card.value.toLowerCase() + " of " + session.attributes.player_card.suit.toLowerCase() + ".";
                }else{
                    // tie
                    outcome = "Oh my! We both have " + session.attributes.alexa_card.value.toLowerCase() + "s. That's a tie!";
                }

                // get a new hand
                dealCards(session, response, callback);
            },
            function(speech, callback){
                outcome = {
                    "speech": "<speak>" + outcome + "<break time=\"600ms\"/>The score is " + session.attributes.hands_won + " to " + session.attributes.hands_lost + "<break time=\"700ms\"/>" + speech + "</speak>",
                    "type": AlexaSkill.speechOutputType.SSML
                };
                reprompt = speech;
                callback(null, null);
            }
        ], function(err, result){
            if(err){
                response.tell(err);
            }else{
                response.ask(outcome, reprompt);
            }
        });
    },

    "NoIntent": function (intent, session, response) {
        VoiceInsights.track(intent.name);

        // player has decided to fold
        var outcome = "";
        var reprompt = "";
        async.waterfall([
            function(callback){
                // evaluate the current hand
                if(cardValueToNumber(session.attributes.player_card.value) > cardValueToNumber(session.attributes.alexa_card.value)){
                    // player would have won
                    session.attributes.hands_lost += 1;
                    outcome = "Bad call! Your " + session.attributes.player_card.value.toLowerCase() + " of " + session.attributes.player_card.suit.toLowerCase() + " would have defeated my " + session.attributes.alexa_card.value.toLowerCase() + " of " + session.attributes.alexa_card.suit.toLowerCase() + ".";
                }else if(cardValueToNumber(session.attributes.player_card.value) < cardValueToNumber(session.attributes.alexa_card.value)){
                    // alexa would have won
                    session.attributes.hands_won += 1;
                    outcome = "Smart move! My " + session.attributes.alexa_card.value.toLowerCase() + " of " + session.attributes.alexa_card.suit.toLowerCase() + " would have beat your " + session.attributes.player_card.value.toLowerCase() + " of " + session.attributes.player_card.suit.toLowerCase() + ".";
                }else{
                    // would have been a tie
                    outcome = "Safe either way! We both had " + session.attributes.alexa_card.value.toLowerCase() + "s!";
                }

                // get a new hand
                dealCards(session, response, callback);
            },
            function(speech, callback){
                outcome = {
                    "speech": "<speak>" + outcome + "<break time=\"600ms\"/>The score is " + session.attributes.hands_won + " to " + session.attributes.hands_lost + "<break time=\"700ms\"/>" + speech + "</speak>",
                    "type": AlexaSkill.speechOutputType.SSML
                };
                reprompt = speech;
                callback(null, null);
            }
        ], function(err, result){
            if(err){
                response.tell(err);
            }else{
                response.ask(outcome, reprompt);
            }
        });
    },

    "AMAZON.HelpIntent": function (intent, session, response) {
        VoiceInsights.track(intent.name);
        response.ask(APP_NAME + " is a card game based on Blind Man's Bluff. On each deal, without knowing what card you have, you must decide if you think your card can beat my card, which is revealed to you. Say \"deal\" to play!");
    },

    "AMAZON.StopIntent": function (intent, session, response) {
        VoiceInsights.track(intent.name);
        response.tell("O.K. Thanks for playing!");
    },

    "AMAZON.CancelIntent": function (intent, session, response) {
        VoiceInsights.track(intent.name);
        response.tell("O.K.");
    }
};

function cardValueToNumber(cardValue){
    switch(cardValue.toUpperCase()){
        case "ACE":
            return 14;
        case "KING":
            return 13;
        case "QUEEN":
            return 12;
        case "JACK":
            return 11;
        default:
            return parseInt(cardValue);

    }
}

// retrieves details of a new shuffled card deck
function getCardDeck(callback){
    http.get(CARDS_BASE_URL + "/new/shuffle/", function(res){
        var body = "";

        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function () {
            try{
                var result = JSON.parse(body);

                if(result && result.success){
                    callback(null, result);
                }else{
                    console.log("Invalid API response");
                    console.log(body);
                    callback("Error shuffling the deck", null);
                }
            }catch(e){
                console.log(body);
                console.log(e);
                callback("Error shuffling the deck", null);
            }
        });
    }).on('error', function (e) {
        console.log(e);
        callback("Error shuffling the deck", null);
    });
}

function drawCardsFromDeck(deck_id, count, callback){
    http.get(CARDS_BASE_URL + "/" + deck_id + "/draw/?count=" + count, function(res){
        var body = "";

        res.on('data', function (chunk) {
            body += chunk;
        });

        res.on('end', function () {
            try{
                var result = JSON.parse(body);

                if(result && result.success){
                    callback(null, result);
                }else{
                    console.log("Invalid API response");
                    console.log(body);
                    callback("Error drawing cards", null);
                }
            }catch(e){
                console.log(e);
                callback("Error drawing cards", null);
            }
        });
    }).on('error', function (e) {
        console.log(e);
        callback("Error drawing cards", null);
    });
}

function dealCards(session, response, callback){
    // check if the deck is empty to end the game
    if(session.attributes.cards_remaining == 0){
        callback("You went through a whole deck! Thank you for playing. Come back soon!");
        return;
    }

    // game not over yet! draw a couple more cards
    drawCardsFromDeck(session.attributes.deck_id, 2, function(err, result){
        if(!err && result.success && result.cards.length == 2){
            session.attributes.cards_remaining = result.remaining;
            session.attributes.player_card = result.cards[0];
            session.attributes.alexa_card = result.cards[1];
            var speak = "";
            if(session.attributes.cards_remaining > 48){
                callback(null, "I draw a " + session.attributes.alexa_card.value.toLowerCase() + " of " + session.attributes.alexa_card.suit.toLowerCase() + " and place it on my forehead. Do you stay, or fold?");
            }else{
                // use a shorter message
                callback(null, "I draw a " + session.attributes.alexa_card.value.toLowerCase() + " of " + session.attributes.alexa_card.suit.toLowerCase() + ". Do you stay?");
            }
        }else{
            // an error occurred
            callback("Sorry, looks like this deck is missing a few cards. Please try playing again later.");
        }
    });
}

function newGame(session, response){
    async.waterfall([
        function(callback){
            // get a new deck of cards
            getCardDeck(callback);
        },
        function(deck, callback){
            // store info about the deck in the current session
            session.attributes.deck_id = deck.deck_id;
            session.attributes.cards_remaining = deck.remaining;
            session.attributes.hands_won = 0;
            session.attributes.hands_lost = 0;
            session.attributes.player_card = null;
            session.attributes.alexa_card = null;

            callback(null, null);
        }
    ], function(err, result){
        if(err){
            console.log(err);
            response.tell("Sorry, I'm having trouble finding a deck of cards at the moment. Please try again later.");
        }else{
            response.ask("Welcome to " + APP_NAME + "! I have a new deck ready to be dealt. Say \"play\" to start or \"help\" for instructions.", "Say \"play\" to start or \"help\" for instructions.");
        }
    });
}



// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    // Create an instance of the MyApp skill.
    var skill = new MyApp();
    skill.execute(event, context);
};
