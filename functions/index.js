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
	ALGO_MAIS : 'ALGO_MAIS',
	ASK_PUCID : 'ASK_PUCID',
	MATERIA_NOT_FOUND : 'MATERIA_NOT_FOUND',
	NOTA_MAIS_DETALHES : 'NOTA_MAIS_DETALHES',
	QTD_FALTAS : 'QTD_FALTAS',
	QTD_FALTAS_ZERO : 'QTD_FALTAS_ZERO',
	SUA_NOTA : 'SUA_NOTA',
	WELCOME :  'WELCOME',
	WELCOME_FIRST : 'WELCOME_FIRST',
}

const CONTEXTS = {
	BUSCAR_NOTA : "BUSCAR_NOTA",
	BUSCAR_ALUNO : "BUSCAR_ALUNO",
	BUSCAR_FALTAS : "BUSCAR_FALTAS",
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
		conv.ask(buildSpeech(getRandomEntry(dialogs[PHRASES.WELCOME_FIRST]).replace('$1',appName)));
	}
	else{
		checkUpdates(conv);
		//TODO: Select a dialog accordingly to any updates
		conv.ask(buildSpeech(getRandomEntry(dialogs[PHRASES.WELCOME]).replace('$1',appName)));
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

		conv.user.storage.proximaAcao = CONTEXTS.BUSCAR_NOTA;
		conv.user.storage.disciplina = disciplina;

		//asks for PUC ID
		conv.ask(buildSpeech(getRandomEntry(dialogs[PHRASES.ACK]) +  ',' + getRandomEntry(dialogs[PHRASES.ASK_PUCID])));
	}
	else{
		
		conv.ask(getGrades(matricula,disciplina));
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

	followUpObterMatricula(matricula);
	
});

app.intent('sga.buscarFaltas', (conv, {disciplina})=>{



	conv.contexts.set(CONTEXTS.BUSCAR_FALTAS,5);

	let matricula = conv.user.storage.matricula; 
	console.log(`matricula: ${matricula}`);
	if(!matricula){
		console.log(`perguntar matricula`);
		//no student id found, ask for it
		conv.contexts.set(CONTEXTS.BUSCAR_ALUNO,5);
		// raise the lifespan of BUSCAR_FALTAS contexts
		conv.contexts.set(CONTEXTS.BUSCAR_FALTAS,15);

		conv.user.storage.proximaAcao = CONTEXTS.BUSCAR_FALTAS;
		conv.user.storage.disciplina = disciplina;

		//asks for PUC ID
		conv.ask(buildSpeech(getRandomEntry(dialogs[PHRASES.ACK]) +  ',' + getRandomEntry(dialogs[PHRASES.ASK_PUCID])));
	}
	else{
		
		conv.ask(getAttendance(matricula,disciplina));
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

function followUpObterMatricula(matricula) {

	let disciplina = conv.user.storage.disciplina;

	//if it was searching for grades
	if(conv.user.storage.proximaAcao === CONTEXTS.BUSCAR_NOTA){
		conv.ask(getGrades(matricula,disciplina));
	}
	else if(conv.user.storage.proximaAcao === CONTEXTS.BUSCAR_FALTAS){
		conv.ask(getAttendance(matricula,disciplina));
	}
	else{
		//TODO
		conv.ask('Ok, sua matricula foi salva.');
	}
}

function getAttendance(matricula,disciplina){

	let resposta = '';

	console.log(JSON.stringify(mockNotas));
	console.log(`${matricula} : ${disciplina}`);

	console.log(`somar as faltas`);
	let materia = mockNotas[matricula][disciplina];
	if(!materia){
		resposta = getRandomEntry(dialogs[PHRASES.MATERIA_NOT_FOUND]);
		//TODO: read all subjects the student is enrolled at
	}
	else{
		let aulas = materia.carga;
		let faltas = materia.faltas;
		if(faltas == 0){
			resposta = getRandomEntry(dialogs[PHRASES.QTD_FALTAS_ZERO]);
		}
		else{
			//Trata uma ou duas faltas por causa do gênero
			if(faltas == 1){
				faltas = `<sub alias="uma">1</sub>`;
			}
			else if(faltas == 2){
				faltas = `<sub alias="duas">2</sub>`;
			}
			resposta = getRandomEntry(dialogs[PHRASES.QTD_FALTAS]).replace('$1',faltas);
		}
	}

	return buildSpeech(`${getRandomEntry(dialogs[PHRASES.ACK])}.</s><s>${resposta}</s><s>${getRandomEntry(dialogs[PHRASES.ALGO_MAIS])}`);
}

function getGrades(matricula,disciplina){

	let resposta = '';

	console.log(JSON.stringify(mockNotas));
	console.log(`${matricula} : ${disciplina}`);

	console.log(`somar as atividades`);
	let materia = mockNotas[matricula][disciplina];
	if(!materia){
		resposta = getRandomEntry(dialogs[PHRASES.MATERIA_NOT_FOUND]);
		//TODO: read all subjects the student is enrolled at
	}
	else{
		let total = 0;
		for(let i=0;i<materia.notas.length;i++){
			total += materia.notas[i].nota;
		}
		resposta = getRandomEntry(dialogs[PHRASES.SUA_NOTA]).replace('$1',total);
	}

	return buildSpeech(`${getRandomEntry(dialogs[PHRASES.ACK])}.</s><s>${resposta}</s><s>${getRandomEntry(dialogs[PHRASES.NOTA_MAIS_DETALHES])}`);
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

function buildSpeech(text){
	return `<speak><s>${text}</s></speak>`;
}
