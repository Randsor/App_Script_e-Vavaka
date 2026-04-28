function doGet() {
  // Commande fantôme pour forcer le lien DriveApp au démarrage
  try { DriveApp.getRootFolder(); } catch(e) {} 
  
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Cultes FPMA Toulouse')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=yes');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// Fonction utilitaire à lancer UNE FOIS manuellement depuis l'éditeur
function forceAuthGlobale() {
  DriveApp.getFiles().hasNext(); // Force l'accès Drive global
  var doc = DocumentApp.create('Temp Auth Doc'); // Force l'accès Docs
  DriveApp.getFileById(doc.getId()).setTrashed(true); // Passe par Drive pour jeter le fichier
  SpreadsheetApp.getActiveSpreadsheet(); // Force l'accès Sheets
}