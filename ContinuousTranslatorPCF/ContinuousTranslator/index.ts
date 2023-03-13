import {IInputs, IOutputs} from "./generated/ManifestTypes";
//import { SpeechSDK} from "microsoft-cognitiveservices-speech-sdk";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { Context } from "microsoft-cognitiveservices-speech-sdk/distrib/lib/src/common.speech/Exports";

export class ContinuousTranslator implements ComponentFramework.StandardControl<IInputs, IOutputs> {

	private containerElement: HTMLDivElement;
	private displayTempResult:HTMLInputElement;
	private startButton :HTMLButtonElement;
	private stopButton :HTMLButtonElement;
	private endpointInUse: string;
	private _recognizedEventHandler: (OutputText:string) => void;
	private _recognizingEventHandler: (temporaryText:string) => void;
	private lastMessage: SpeechSDK.SpeechRecognitionResult;
	private _context: ComponentFramework.Context<IInputs>;
	private reco: SpeechSDK.SpeechRecognizer|undefined;
	private _notifyOutputChanged: () => void;
	private isRecording:boolean;
	private autoRestartRecognition:boolean;
	private currentSessionId: string;
	
	//empty constructor
	constructor()
	{

	}

	/**
	 * Used to initialize the control instance. Controls can kick off remote server calls and other initialization actions here.
	 * Data-set values are not initialized here, use updateView.
	 * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to property names defined in the manifest, as well as utility functions.
	 * @param notifyOutputChanged A callback method to alert the framework that the control has new outputs ready to be retrieved asynchronously.
	 * @param state A piece of data that persists in one session for a single user. Can be set at any point in a controls life cycle by calling 'setControlState' in the Mode interface.
	 * @param container If a control is marked control-type='standard', it will receive an empty div element within which it can render its content.
	 */
	public init(context: ComponentFramework.Context<IInputs>, notifyOutputChanged: () => void, state: ComponentFramework.Dictionary, container:HTMLDivElement)
	{
		this._notifyOutputChanged = notifyOutputChanged;
		//this._recognizedEventHandler = this.handleRecognition.bind(this);
		//this._recognizingEventHandler = this.handleTemporaryRecognition.bind(this);
		this._context = context;

		this.containerElement = document.createElement('div');
		this.displayTempResult = document.createElement('input');
		this.displayTempResult.setAttribute('type','label');
		this.displayTempResult.classList.add("tempTextBox");
		this.displayTempResult.disabled =context.mode.isControlDisabled;

		this.startButton  = document.createElement('button');
		this.startButton.addEventListener("click", this.onStartButtonClick.bind(this));
		this.startButton.classList.add("StartRecoButton")
		this.startButton.innerText = context.resources.getString("StartRecButtonLabel_Key");

		this.stopButton  = document.createElement('button');
		this.stopButton.addEventListener("click", this.onStopButtonClick.bind(this));
		this.stopButton.innerText = context.resources.getString("StopRecButtonLabel_Key");		
		this.stopButton.classList.add("StopRecoButton")

		this.containerElement.appendChild(this.startButton);
		this.containerElement.appendChild(this.stopButton);
		this.containerElement.appendChild(this.displayTempResult);
		this.endpointInUse = this.getEndpointValue();
		this.autoRestartRecognition = false;
		this._context.mode;
		
		this.setRecordingStatus(false);
		this.startButton.disabled = this._context.mode.isControlDisabled; //If the control is disabled set the start button as disabled when intiting.
		container.appendChild(this.containerElement);

		// Add control initialization code
		

	
	}

	private onStartButtonClick( e:Event){
		setTimeout( () => {this.sdkStartContinuousRecocgnitionBtn();},500);
		
	}

	private onStopButtonClick(e:Event){
		this.sdkStopContinuousRecognitionBtn();
	}

	/**
	 * Called when any value in the property bag has changed. This includes field values, data-sets, global values such as container height and width, offline status, control metadata values such as label, visible, etc.
	 * @param context The entire property bag available to control via Context Object; It contains values as set up by the customizer mapped to names defined in the manifest, as well as utility functions
	 */
	public updateView(context: ComponentFramework.Context<IInputs>): void
	{

		this._context = context;

		if (this.endpointInUse !=  this.getEndpointValue())
		{
			this.HandleEndpointChange();
		}
		this.setDisabledStatus(this._context.mode.isControlDisabled)
		
		if(this._context.parameters.StopRecognition.raw)
		{
			this.sdkStopContinuousRecognitionBtn();
		}
		if(this._context.parameters.StartRecognition.raw)
		{
			setTimeout( () => {this.sdkStartContinuousRecocgnitionBtn();},500);
		}

	}

	public setDisabledStatus(isDisabled:boolean)
	{
		if (isDisabled)
		{
			this.startButton.disabled = isDisabled;
			this.stopButton.disabled = isDisabled;
		}
		else 
		{
			this.setRecordingStatus(this.isRecording)
		}
	}

	private HandleEndpointChange()
	{
		this.autoRestartRecognition= this.isRecording;
		this.endpointInUse = this.getEndpointValue();
		//stop previous rec
		this.sdkStopContinuousRecognitionBtn();
	}

	private getEndpointValue() :string
	{
		if (this._context.parameters.EndpointId.raw != null && this._context.parameters.EndpointId.raw != "")
		{
			return this._context.parameters.EndpointId.raw ||"";
		}
		else{
			return this._context.parameters.RecognitionLanguage.raw || "";
		}


	}

	/** 
	 * It is called by the framework prior to a control receiving new data. 
	 * @returns an object based on nomenclature defined in manifest, expecting object[s] for property marked as “bound” or “output”
	 */
	public getOutputs(): IOutputs
	{

		//TODO: Better way to handle ID? Now ID is same for many pharses, the offset changes. 
		// Maybe numerate the "chunks" and return ID.chunk
		let result: IOutputs = {
			RecognizedPhrase: this.lastMessage.text,
			RecognizedPhraseId: this.lastMessage.resultId
					};
			return result;
	}

	private  handleRecognizingEvent(s: SpeechSDK.Recognizer, e:SpeechSDK.SpeechRecognitionEventArgs) {
		window.console.log(e);
		this.displayTempResult.value = e.result.text;
	}

	private  handleRecognizedEvent(s: SpeechSDK.Recognizer, e:SpeechSDK.SpeechRecognitionEventArgs) {
		window.console.log(e);

		if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
			var noMatchDetail = SpeechSDK.NoMatchDetails.fromResult(e.result);			
		} else {			
			this.lastMessage = e.result;		
			this._notifyOutputChanged();
		}
	}

	private handleRecognitionCancelledEvent(s: SpeechSDK.Recognizer, e : SpeechSDK.SpeechRecognitionCanceledEventArgs)
	{
		window.console.log(e);		
		//this.setRecordingStatus(false);
		
	}
	private handleSessionStoppedEvent(s: SpeechSDK.Recognizer, e : SpeechSDK.SessionEventArgs)
	{
		window.console.log(e);
		if (this.currentSessionId == e.sessionId){
			this.setRecordingStatus(false);
		}		
	}

	private handleSessionStartedEvent(s: SpeechSDK.Recognizer, e : SpeechSDK.SessionEventArgs)
	{
		window.console.log(e);
		this.currentSessionId = e.sessionId
		this.setRecordingStatus(true);
		
	}
	private setRecordingStatus(newStatus:boolean)
	{
		this.isRecording = newStatus;

		this.stopButton.disabled = !this.isRecording;
		this.startButton.disabled = this.isRecording;
	}

	
	private sdkStartContinuousRecocgnitionBtn()	{
		// Depending on browser security settings, the user may be prompted to allow microphone use. Using continuous recognition allows multiple
		// phrases to be recognized from a single use authorization.
		
		if(this.isRecording) //If currently recording dont start new 
		{
			console.log("allready recording. SessionID: " + this.currentSessionId)
			return;
		}

		var audioConfig;
		audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

		var speechConfig;
		//speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(this._context.parameters.AuthToken.raw || "" , this._context.parameters.AzureRegion.raw || "");
		//speechConfig = SpeechSDK.SpeechConfig.fromEndpoint(new URL("wss://westeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?cid=792ce5e8-7189-4544-9ae1-a65a1824c1da"), "" );
        speechConfig = SpeechSDK.SpeechConfig.fromSubscription(this._context.parameters.AuthToken.raw || "", this._context.parameters.AzureRegion.raw || "" );
		//speechConfig.authorizationToken = this._context.parameters.AuthToken.raw || "";
		if (this._context.parameters.EndpointId.raw != null 
            && this._context.parameters.EndpointId.raw != ""
            && this._context.parameters.EndpointId.raw != "val")
		{
			speechConfig.endpointId = this._context.parameters.EndpointId.raw || "";
		}
		else{
			speechConfig.speechRecognitionLanguage = this._context.parameters.RecognitionLanguage.raw ||"" ;
		}

		
		
		this.reco = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

		// Before beginning speech recognition, setup the callbacks to be invoked when an event occurs.
		// The event recognizing signals that an intermediate recognition result is received.
		// You will receive one or more recognizing events as a speech phrase is recognized, with each containing
		// more recognized speech. The event will contain the text for the recognition since the last phrase was recognized.
		this.reco.recognizing = this.handleRecognizingEvent.bind(this);
		

		// The event recognized signals that a final recognition result is received.
		// This is the final event that a phrase has been recognized.
		// For continuous recognition, you will get one recognized event for each phrase recognized.
		this.reco.recognized =  this.handleRecognizedEvent.bind(this);		

		// The event signals that the service has stopped processing speech.
		// https://docs.microsoft.com/javascript/api/microsoft-cognitiveservices-speech-sdk/speechrecognitioncanceledeventargs?view=azure-node-latest
		// This can happen for two broad classes of reasons.
		// 1. An error is encountered.
		//    In this case the .errorDetails property will contain a textual representation of the error.
		// 2. No additional audio is available.
		//    Caused by the input stream being closed or reaching the end of an audio file.
		this.reco.canceled = this.handleRecognitionCancelledEvent.bind(this);

		// Signals that a new session has started with the speech service
		this.reco.sessionStarted = this.handleSessionStartedEvent.bind(this) ;		

		// Signals the end of a session with the speech service.
		this.reco.sessionStopped = this.handleSessionStoppedEvent.bind(this);
		

		// Signals that the speech service has started to detect speech.
		this.reco.speechStartDetected = function (s, e) {
			window.console.log(e);		
		};

		// Signals that the speech service has detected that speech has stopped.
		this.reco.speechEndDetected = function (s, e) {
			window.console.log(e);			
		};

		// Starts recognition
		this.reco.startContinuousRecognitionAsync();

	}

	private sdkStopContinuousRecognitionBtn() {
		

		if (this.reco === undefined)
		{
			return;
		}
		this.reco.stopContinuousRecognitionAsync( 				
			this.stopContinuousRecognitionAsyncHandler.bind(this)
			,
			this.stopContinuousRecognitionAsyncHandlerError.bind(this)
			);
			
		this.setRecordingStatus(false);
			
	}

	private	stopContinuousRecognitionAsyncHandler()
	{
		if(this.reco === undefined){
			return;
		}
		this.reco.close();
		//delete this.reco;

		this.setRecordingStatus(false);
		if(this.autoRestartRecognition)
		{
			this.autoRestartRecognition = false;
			
			//Better way to handle autostart?. Added timeout to prevent problems when automatically creating new session while closing old one in progress.
			setTimeout( () => {this.sdkStartContinuousRecocgnitionBtn();},500);
		}
		
	}
	private	stopContinuousRecognitionAsyncHandlerError(err:any)
	{
		this.setRecordingStatus(false);

		if(this.reco === undefined)
		{
				return;
		}
		this.reco.close();
		//delete this.reco;
	}
	/** 
	 * Called when the control is to be removed from the DOM tree. Controls should use this call for cleanup.
	 * i.e. cancelling any pending remote calls, removing listeners, etc.
	 */
	public destroy(): void
	{
		// Add code to cleanup control if necessary
	}
}