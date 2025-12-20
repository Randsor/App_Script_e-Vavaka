var SHEET_NAME_TEMPLATES = "DB_TEMPLATES";

function getTemplatesList() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME_TEMPLATES);
    
    // Si l'onglet n'existe pas, on renvoie une liste vide (pas d'erreur)
    if (!sheet) return [];
    
    var lastRow = sheet.getLastRow();
    
    // CRUCIAL : Si on a moins de 2 lignes (juste l'en-tête ou vide), on s'arrête là.
    // Sinon, getRange(2, 1, 0, 2) provoque une erreur fatale.
    if (lastRow < 2) return [];
    
    // On récupère les données
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    
    // On nettoie et on formate
    return data
      .filter(function(row) { return row[0] !== ""; }) // Enlève les lignes vides
      .map(function(row) { 
        return { id: row[0], nom: row[1] }; 
      });
      
  } catch (e) {
    // En cas de catastrophe, on log l'erreur et on renvoie vide pour débloquer l'interface
    console.error("Erreur getTemplatesList: " + e.toString());
    return [];
  }
}

function getTemplateDetails(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_TEMPLATES);
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return {
        id: data[i][0],
        nom: data[i][1],
        structure: data[i][2], 
        rowIndex: i + 1
      };
    }
  }
  return null;
}

function saveTemplateBackend(form) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_TEMPLATES);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME_TEMPLATES); // Crée l'onglet s'il manque
  
  if (form.rowIndex) {
    var row = parseInt(form.rowIndex);
    sheet.getRange(row, 2).setValue(form.nom);
    sheet.getRange(row, 3).setValue(form.structure);
    return "Template mis à jour !";
  } else {
    var newId = "TPL_" + new Date().getTime();
    sheet.appendRow([newId, form.nom, form.structure]);
    return "Template créé !";
  }
}

function deleteTemplateBackend(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_TEMPLATES);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return "Template supprimé.";
    }
  }
}