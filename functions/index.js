const functions = require('firebase-functions');
const fs = require('fs');
const {
  dialogflow,Suggestions} = require('actions-on-google');

const dialogs = JSON.parse(fs.readFileSync('./dialogs.json', 'utf8'));
const mockAlunos = JSON.parse(fs.readFileSync('./mockAlunos.json', 'utf8'));
const mockNotas = JSON.parse(fs.readFileSync('./mockNotas.json', 'utf8'));

const firebase = require('firebase');

const app = dialogflow({debug: true});

const appName = "SGA";

const PHRASES = {
	ACK : 'ACK',
	ASK_PUCID : 'ASK_PUCID',
	WELCOME :  'WELCOME',
	WELCOME_FIRST : 'WELCOME_FIRST',

}

const CONTEXTS = {
	BUSCAR_NOTA : "BUSCAR_NOTA",
	BUSCAR_ALUNO : "BUSCAR_ALUNO",
}

const config = {
	apiKey: "",
	authDomain: "sga-pdtepj.firebaseapp.com",
	databaseURL: "https://sga-pdtepj.firebaseio.com",
	storageBucket: "sga-pdtepj.appspot.com"
};

firebase.initializeApp(config);

let aluno;

app.intent('Default Welcome Intent', (conv) => {

	aluno = getAluno(conv.user.id);

	console.log(`locale? ${conv.user.locale}, aluno:${aluno}`);
	if(!conv.user.last.seen){
		conv.ask(getRandomEntry(dialogs[PHRASES.WELCOME_FIRST]).replace('$1',appName));
	}
	else{
		checkUpdates(conv);
		//TODO: Select a dialog accordingly to any updates
		conv.ask(getRandomEntry(dialogs[PHRASES.WELCOME]).replace('$1',appName));
	}
	
	conv.ask(new Suggestions(['Ver Notas','Faltas','Calendário']));
});

app.intent('sga.buscarNota', (conv, {disciplina}) => {

	conv.contexts.set(CONTEXTS.BUSCAR_NOTA,5);

	let matricula = conv.user.storage.matricula; 
	console.log(`matricula: ${matricula}`);
	if(!matricula){
		console.log(`perguntar matricula`);
		//no student id found, ask for it
		conv.contexts.set(CONTEXTS.BUSCAR_ALUNO,5);
		// raise the lifespan of BUSCAR_NOTA contexts
		conv.contexts.set(CONTEXTS.BUSCAR_NOTA,15);

		conv.user.storage.buscarNota = disciplina;

		//asks for PUC ID
		conv.ask(getRandomEntry(dialogs[PHRASES.ACK]) +  ',' + getRandomEntry(dialogs[PHRASES.ASK_PUCID]));
	}
	else{
		
		conv.ask(getGrades(disciplina));
	}
});

app.intent('sga.obterMatricula', (conv, {matricula}) =>{
	console.log(`obtem matricula: ${matricula}`);

	//save to the user storage
	conv.user.storage.matricula = matricula;

	//TODO: USE SGA service to get the real names
	if(mockAlunos[matricula]){

		aluno = mockAlunos[matricula];

		console.log(`aluno: ${aluno}`);

		firebase.database().ref('/alunos/' + matricula).set({
			name: aluno.nome
		});
	}

	console.log(`contexts:${JSON.stringify(conv.contexts)}`);

	console.log(`contexto:${conv.contexts.get(CONTEXTS.BUSCAR_NOTA)}`);
	//if it was searching for grades
	if(conv.contexts.get(CONTEXTS.BUSCAR_NOTA)){
		conv.ask(getGrades(conv.user.storage.buscarNota));
	}
});

app.intent('apagar.resetaAluno', (conv) => {
	aluno = undefined;
	conv.user.storage = undefined;
	conv.ask('Aluno apagado');
});

app.intent('apagar.qualMatricula', (conv) =>{
	
	conv.ask('A matricula é ' + conv.user.storage.matricula);
	
});

exports.sgaAssistant = functions.https.onRequest(app);

function getGrades(disciplina){

	let resposta = '';

	console.log(`somar as atividades`);
	let materia = mockNotas[matricula][disciplina];
	if(!materia){
		resposta = "Não achei esta matéria na sua lista de cursados deste semestre.";
		//TODO: read all subjects the student is enrolled at
	}
	else{
		let total = 0;
		for(let i=0;i<materia.notas.length;i++){
			total += materia.notas[i].nota;
		}
		resposta = `Sua nota é ${total}`;
	}

	return resposta
}

function checkUpdates(conv){
	//Checks for updates in Notas, Faltas, Atividades
}

function getRandomEntry(arr){
		return arr[Math.floor(Math.random() * arr.length)];
	}

function getAluno(userId){   
return new Promise(function (resolve, reject) {     
	firebase.database().ref('/alunos/' + userId).once('value').then(function(snapshot) {       
		resolve(snapshot.val());     }).catch(reject);   }); 
}
