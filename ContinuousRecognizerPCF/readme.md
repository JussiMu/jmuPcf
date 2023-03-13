#Continuous Recgonizer PCF

This project contains on PCF Control for Power Apps Canvas Apps that uses Microsoft Azure Cognitive Service to recognize speech from Microphone input stream.

##Parameters 

###Inputs
AuthToken: 
Auth token for authenticating Azure Speech Service endpoint. It is highly recomended to create a seperate backend process for handling authentication and return a AuthToken so there is no need to expose the subscription key on client side. Leave blank if using subscription key authentication.

Subscription Key: 
Authentication with subscription key. If AuthToken authentication is implemented leave this blank.

EndpointId:
When using a custom endpoint for speech recognition provide the enpoint id here. Leave empty when using the Micorosft Base model and provide the RecognitionLanguage parameter. If endpoint value changes while the recgonition is running the current session is terminated and new one is automatically started.

AzureRegion:

The Azure Region where the Speech Recognition enpoint is registered. Default is westeurope

StartRecgonition:
Boolean parameter to start the recgonition from the app. Setting to false will not stop the recognition, use StopRecgonition paremeter for that.

If the recognition is controlled using these parameters it is recomended to hide/disable/set to view mode the control so the buttons rendered by the control are inactive. The inbuild buttons won#t change the parameter values which easily causes state incostencies if mixing parameter based control with the inbuild buttons.

StopRecgonition:
Boolean parameter to stop the recgonition from the app. 

RecognitionLanguage: 
Provide the language code when using the default endpoint for recgonition. 
List of supported languages and codes: https://learn.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support?tabs=stt#custom-speech


###Outputs
RecognizedPhrase: 

Complete phares recognized by the service. The value will be overwriten when next phares is recognized so it is good idea to store values into collection

There is a text box in the control displaying the "temporary" phares while the service is still waiting for the pharse to be completed. This value is not provided as output of the PCF. 

RecognizedPhraseId:
The Id that Azure service provides for the Pharse. It seems that all phares do not get unique id when recgonizing continuosly. The value is appended by offset value to get unique id for each recgonized phares. <resultId>.<offset>