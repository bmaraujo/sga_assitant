const functions = require('firebase-functions');
const fs = require('fs');
const {
  dialogflow,Suggestions} = require('actions-on-google');

const dialogs = JSON.parse(fs.readFileSync('./dialogs.json', 'utf8'));
const mockAlunos = JSON.parse(fs.readFileSync('./mockAlunos.json', 'utf8'));
const mockNotas = JSON.parse(fs.readFileSync('./mockNotas.json', 'utf8'));
const calendario = JSON.parse(fs.readFileSync('./calendario.json', 'utf8'));

const firebase = require('firebase');

const app = dialogflow({debug: true});

const appName = "SGA";

const PHRASES = {
	ACK : 'ACK',
	ALGO_MAIS : 'ALGO_MAIS',
	ASK_PUCID : 'ASK_PUCID',
	AULA_PERIODO : 'AULA_PERIODO',
	AULA_TODO_PERIODO : 'AULA_TODO_PERIODO',
	HORARIO_AULA : "HORARIO_AULA",
	HORARIO_MAIS_AULA : "HORARIO_MAIS_AULA",
	HORARIO_SEM_AULA : "HORARIO_SEM_AULA",
	HORARIO_SO_UMA_AULA : "HORARIO_SO_UMA_AULA",
	MATERIA_NOT_FOUND : 'MATERIA_NOT_FOUND',
	NAO_AULA_PERIODO : 'NAO_AULA_PERIODO',
	NAO_AULA_TODO_PERIODO : 'NAO_AULA_TODO_PERIODO',
	NAO_TEM_AULA_DIA : 'NAO_TEM_AULA_DIA',
	NOTA_MAIS_DETALHES : 'NOTA_MAIS_DETALHES',
	QTD_FALTAS : 'QTD_FALTAS',
	QTD_FALTAS_ZERO : 'QTD_FALTAS_ZERO',
	SEMESTRE_LETIVO : 'SEMESTRE_LETIVO',
	SUA_NOTA : 'SUA_NOTA',
	TEM_AULA_DIA : 'TEM_AULA_DIA',
	WELCOME :  'WELCOME',
	WELCOME_FIRST : 'WELCOME_FIRST',
}

const CONTEXTS = {
	BUSCAR_NOTA : "BUSCAR_NOTA",
	BUSCAR_ALUNO : "BUSCAR_ALUNO",
	BUSCAR_FALTAS : "BUSCAR_FALTAS",
	QUADRO_HORARIO : "QUADRO_HORARIO",
}

const config = {
	apiKey: "",
	authDomain: "sga-pdtepj.firebaseapp.com",
	databaseURL: "https://sga-pdtepj.firebaseio.com",
	storageBucket: "sga-pdtepj.appspot.com"
};

firebase.initializeApp(config);

app.intent('Default Welcome Intent', (conv) => {

	let aluno = conv.user.storage.aluno;

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

		let aluno = mockAlunos[matricula];

		console.log(`aluno: ${aluno}`);

		conv.user.storage.aluno = aluno;

		// firebase.database().ref('/alunos/' + matricula).set({
		// 	name: aluno.nome
		// });
	}

	console.log(`contexts:${JSON.stringify(conv.contexts)}`);

	console.log(`contexto:${conv.contexts.get(CONTEXTS.BUSCAR_NOTA)}`);

	followUpObterMatricula(matricula,conv);
	
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

app.intent('sga.calendario.semestre_letivo',(conv) =>{

	let semestre_letivo = getSemestreLetivo();

	let inicio = getDateSpeech(semestre_letivo.semestre_letivo.inicio);
	let fim = getDateSpeech(semestre_letivo.semestre_letivo.fim);

	let resposta = getRandomEntry(dialogs[PHRASES.SEMESTRE_LETIVO]).replace('$1',inicio).replace('$2',fim);

	conv.ask(buildSpeech(`${getRandomEntry(dialogs[PHRASES.ACK])}.</s><s>${resposta}</s><s>${getRandomEntry(dialogs[PHRASES.ALGO_MAIS])}`));

});

app.intent('sga.calendario.aulaDia',(conv, {dia}) =>{

	console.log(`raw dia:${dia}`);

	let semestre_letivo = getSemestreLetivo();

	let resposta;

	if(dia){
		console.log(`isObject:${typeof dia === "object"}`);
		//if dia is a date
		if(!(typeof dia === "object")){
			console.log(`um dia:${dia}`);
			let temAula = true;
			let i=0; 
			while(i<semestre_letivo.semestre_letivo.feriados.length && temAula){
				let feriado = new Date(semestre_letivo.semestre_letivo.feriados[i++]);
				console.log(`${feriado}=${dateDiffInDays(feriado,new Date(dia))}`);
				if(dateDiffInDays(feriado,new Date(dia)) == 0){
					temAula = false;
				}
			}
			console.log(`tem aula?${temAula}`);
			if(temAula){
				resposta = getRandomEntry(dialogs[PHRASES.TEM_AULA_DIA]);
			}
			else{
				resposta = getRandomEntry(dialogs[PHRASES.NAO_TEM_AULA_DIA]);
			}
		}
		else{
			//Could be a period 
			let startDate = dia.startDate; 
			startDate.setDate(startDate.getDate() +1);//sunday is the first day
			let endDate = dia.endDate;

			console.log(`de ${startDate} a ${endDate}`);

			let qtdDias = (endDate - startDate)/1000/60/60/24; // miliseconds/seconds/minutes/hours

			console.log(`qtdDias:${qtdDias}`);

			let i=0;
			let _dia = startDate;
			let semAula = 0;
			let dias = [];

			while(i<qtdDias){
				let j =0;
				while(j<semestre_letivo.semestre_letivo.feriados.length && temAula){
					let feriado = new Date(semestre_letivo.semestre_letivo.feriados[j++]);
					console.log(`${feriado}=${feriado - _dia}`);
					if((feriado - _dia) == 0){
						semAula++;
						temAula = false;
					}
				}
				dias.push(temAula);
				i++;
				_dia.setDate(_dia.getDate()+1);
			}

			if(semAula == 0){
				//todos os dias tem aula
				resposta = getRandomEntry(dialogs[PHRASES.AULA_TODO_PERIODO]);
			}
			else if(semAula == qtdDias){
				//nenhum dia tem aula
				resposta = getRandomEntry(dialogs[PHRASES.NAO_AULA_TODO_PERIODO]);
			}
			else if(semAula > (qtdDias/2)){
				//mais sem aula do que com aula
				resposta = getRandomEntry(dialogs[PHRASES.NAO_AULA_PERIODO]);
			}
			else{
				//mais com aula do que sem aula
				resposta = getRandomEntry(dialogs[PHRASES.AULA_PERIODO]);
			}
		}

	}

	conv.ask(buildSpeech(`${getRandomEntry(dialogs[PHRASES.ACK])}.</s><s>${resposta}</s><s>${getRandomEntry(dialogs[PHRASES.ALGO_MAIS])}`));
});

app.intent('sga.calendario.horario', (conv,{dia}) =>{

	conv.contexts.set(CONTEXTS.QUADRO_HORARIO,5);

	let matricula = conv.user.storage.matricula; 
	console.log(`matricula: ${matricula}`);
	if(!matricula){
		console.log(`perguntar matricula`);
		//no student id found, ask for it
		conv.contexts.set(CONTEXTS.BUSCAR_ALUNO,5);
		// raise the lifespan of QUADRO_HORARIO contexts
		conv.contexts.set(CONTEXTS.QUADRO_HORARIO,15);

		conv.user.storage.proximaAcao = CONTEXTS.QUADRO_HORARIO;
		conv.user.storage.dia = dia;

		//asks for PUC ID
		conv.ask(buildSpeech(getRandomEntry(dialogs[PHRASES.ACK]) +  ',' + getRandomEntry(dialogs[PHRASES.ASK_PUCID])));
	}
	else{
		
		conv.ask(getClassSchedule(matricula,dia));
	}

});

app.intent('apagar.resetaAluno', (conv) => {
	conv.user.storage = undefined;
	conv.ask('Aluno apagado');
});

app.intent('apagar.qualMatricula', (conv) =>{
	
	conv.ask('A matricula é ' + conv.user.storage.matricula);
	
});

exports.sgaAssistant = functions.https.onRequest(app);

function getClassSchedule(matricula, dia){

	let aluno = mockAlunos[matricula];

	console.log(`aluno:${JSON.stringify(aluno)}`);
	console.log(`dia:${dia}, Date(dia):${new Date(dia)}`);
	let diaSemana = new Date(dia).getDay();

	console.log(`diaSemana:${diaSemana}, diaSemana-1: ${diaSemana-1}`);

	let horario = aluno.horario[diaSemana-1];

	let resposta ="";

	console.log(`horario: ${JSON.stringify(horario)}`);

	console.log(`aluno.disciplinas:${JSON.stringify(aluno.disciplinas)}`);

	if(horario && horario.aulas && horario.aulas.length > 0){
		if(horario.aulas.length == 1){
			resposta = getRandomEntry(dialogs[PHRASES.HORARIO_SO_UMA_AULA]).replace('$1',getClassName(horario.aulas[0].materia,aluno.disciplinas));
		}
		else{
			for(let i=0;i<horario.aulas.length;i++){
				if(i == 0){
					resposta = getRandomEntry(dialogs[PHRASES.HORARIO_AULA]).replace('$1',getClassName(horario.aulas[i].materia,aluno.disciplinas)) + ' ';
				}
				else{
					resposta += getRandomEntry(dialogs[PHRASES.HORARIO_MAIS_AULA]).replace('$1',getClassName(horario.aulas[i].materia,aluno.disciplinas));
					if(i< horario.aulas.length -1){
						resposta += ", ";
					}
					else{
						resposta += ".";
					}
				}
			}
		}
	}
	else{
		resposta = getRandomEntry(dialogs[PHRASES.HORARIO_SEM_AULA]);
	}

	return buildSpeech(`${getRandomEntry(dialogs[PHRASES.ACK])}.</s><s>${resposta}</s><s>${getRandomEntry(dialogs[PHRASES.ALGO_MAIS])}`);
}

function getClassName(codigo,disciplinas){
	console.log(`codigo:${codigo}, disciplinas:${JSON.stringify(disciplinas)}`);
	let nome = undefined;
	let i=0;
	while(!nome && i < disciplinas.length){
		console.log(`${disciplinas[i].codigo} == ${codigo}?${disciplinas[i].codigo == codigo}`);
		if(disciplinas[i].codigo == codigo){
			nome = disciplinas[i].nome;
		}
		i++;
	}
	console.log(nome);
	return nome;
}

function getDateSpeech(_date){
	let __date = new Date(_date);

	let resposta = `<say-as interpret-as="date" format="ddmm">${__date.getDate()}/${__date.getMonth()+1}</say-as>`;

	console.log(`getDateSpeech: ${resposta}`);

	return resposta;
}

function getSemestreLetivo(){
	let curDate = new Date();
	let endSem1 = new Date();
	endSem1.setMonth(5);
	endSem1.setDate(30);

	let sem=-1;
	if((curDate - endSem1)<0){
		sem = 1;
	}
	else{
		sem = 2;
	}

	return calendario[sem];
}

function followUpObterMatricula(matricula,conv) {

	let disciplina = conv.user.storage.disciplina;

	//if it was searching for grades
	if(conv.user.storage.proximaAcao === CONTEXTS.BUSCAR_NOTA){
		conv.ask(getGrades(matricula,disciplina));
	}
	else if(conv.user.storage.proximaAcao === CONTEXTS.BUSCAR_FALTAS){
		conv.ask(getAttendance(matricula,disciplina));
	}
	else if(conv.user.storage.proximaAcao === CONTEXTS.QUADRO_HORARIO){
		getClassSchedule(matricula,conv.user.storage.dia)
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

	return buildSpeech(`${getRandomEntry(dialogs[PHRASES.ACK])}.</s><s>${resposta}</s><s>${getRandomEntry(dialogs[PHRASES.ALGO_MAIS])}`);
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

function dateDiffInDays(d1,d2){
	const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
	const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());

	return Math.floor((utc1-utc2)/(1000*60*60*24));
}