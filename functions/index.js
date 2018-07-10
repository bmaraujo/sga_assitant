const functions = require('firebase-functions');
const fs = require('fs');
const {
  dialogflow,Suggestions} = require('actions-on-google');

const dialogs = JSON.parse(fs.readFileSync('./dialogs.json', 'utf8'));

const app = dialogflow({debug: true});

const appName = "SGA";

app.intent('Default Welcome Intent', (conv) => {
	console.log(`locale? ${conv.user.locale}`);
	if(!conv.user.last.seen){
		conv.ask(getRandomEntry(dialogs['WELCOME_FIRST']).replace('$1',appName));
	}
	else{
		conv.ask(getRandomEntry(dialogs['WELCOME']).replace('$1',appName));
	}
	
	conv.ask(new Suggestions(['Ver Notas','Faltas','Calendário']));
});

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });

exports.sgaAssistant = functions.https.onRequest(app);

function checkUpdates(){
	//Checks for updates
}

function getRandomEntry(arr){
		return arr[Math.floor(Math.random() * arr.length)];
	}