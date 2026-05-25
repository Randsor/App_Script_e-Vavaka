// ==========================================
// FICHIER : Helper_Dictionnary.gs (NOUVEAU FICHIER)
// ==========================================

var DICT_CACHE = null;

function getDictionaries() {
  if (DICT_CACHE) return DICT_CACHE;
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var dict = {
    roles: { idToText: {}, textToId: {} },
    noms: { idToText: {}, textToId: {} },
    recueils: { idToText: {}, textToId: {} },
    valideurs: { idToText: {}, textToId: {} }
  };

  function loadSheetToDict(sheetName, dictKey, textColIndex) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    var data = sheet.getRange(2, 1, lastRow - 1, textColIndex).getValues();
    
    data.forEach(function(row) {
      var id = String(row[0]).trim();
      var text = String(row[textColIndex - 1]).trim(); // -1 car 0-indexed
      if (id && text) {
        dict[dictKey].idToText[id] = text;
        dict[dictKey].textToId[text.toLowerCase()] = id;
      }
    });
  }

  loadSheetToDict("CFG_ROLES", "roles", 2);      // Col A: ID, Col B: Nom
  loadSheetToDict("CFG_NOMS", "noms", 2);        // Col A: ID, Col B: Nom
  loadSheetToDict("CFG_RECUEILS", "recueils", 2); // Col A: ID, Col B: Nom
  loadSheetToDict("CFG_VALIDEURS", "valideurs", 2); // Col A: ID, Col B: Nom

  DICT_CACHE = dict;
  return dict;
}

// Transforme un ID en texte clair (pour le Frontend)
function getTextFromId(type, idStr) {
  if (!idStr) return "";
  var dict = getDictionaries()[type];
  return dict.idToText[idStr] || idStr; // Renvoie le texte, ou l'ID brut si non trouvé (ceinture de sécu)
}

// Transforme un texte en ID (pour la Base de données)
function getIdFromText(type, textStr) {
  if (!textStr) return "";
  var cleanText = String(textStr).trim().toLowerCase();
  var dict = getDictionaries()[type];
  return dict.textToId[cleanText] || textStr; // Renvoie l'ID, ou le texte brut si non trouvé
}