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

/**
 * Compresse une chaîne de caractères (JSON) en GZIP + Base64
 */
function compressString(stringData) {
  if (!stringData) return "";
  var blob = Utilities.newBlob(stringData, 'UTF-8');
  var compressedBlob = Utilities.gzip(blob);
  var b64 = Utilities.base64Encode(compressedBlob.getBytes());
  return "GZ:" + b64; // Préfixe pour repérer les données compressées
}

/**
 * Décompresse une chaîne Base64 si elle contient le préfixe GZ:
 * Assure une compatibilité 100% avec les anciens JSON non compressés.
 */
function decompressString(dataStr) {
  if (!dataStr) return "";
  var str = String(dataStr).trim();
  
  // Vérification de rétrocompatibilité
  if (str.substring(0, 3) === "GZ:") {
    try {
      var b64 = str.substring(3);
      var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'application/x-gzip');
      return Utilities.ungzip(blob).getDataAsString('UTF-8');
    } catch (e) {
      console.error("Erreur de décompression : " + e);
      return "[]"; // Fallback de sécurité
    }
  }
  
  // Si c'est un ancien JSON non compressé, on le renvoie tel quel
  return str; 
}