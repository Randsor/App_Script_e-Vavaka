var SHEET_NAME_CONFIG = "CONFIG";

// --- LECTURE ---
function getConfigData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONFIG);
  
  var result = { roles: [], noms: [], valideurs: [], respCode: "", pdfFolderId: "", pdfTemplateId: "" };
  if (!sheet) return result;

  var lastRow = Math.max(sheet.getLastRow(), 100);
  var range = sheet.getRange(1, 1, lastRow, 10); 
  var values = range.getValues();
  var headers = values[0]; 

  var idxRoles = headers.indexOf("Liste_Roles");
  var idxType  = headers.indexOf("Type_Role");
  var idxNoms  = headers.indexOf("Liste_Noms");
  var idxValNom = headers.indexOf("Liste_Valideurs");
  var idxValCode = headers.indexOf("Code_Valideurs");
  
  // Lecture Paramètres
  if (values.length > 1) result.respCode = String(values[1][7] || "");
  if (values.length > 2) {
      result.pdfFolderId = String(values[2][6] || "").trim();
      result.pdfTemplateId = String(values[2][7] || "").trim();
  }

  // Lecture Listes
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (idxRoles > -1 && row[idxRoles]) result.roles.push({ name: String(row[idxRoles]), type: (idxType > -1 ? String(row[idxType]) : "") });
    if (idxNoms > -1 && row[idxNoms]) result.noms.push(String(row[idxNoms]));
    if (idxValNom > -1 && row[idxValNom]) {
        result.valideurs.push({ nom: String(row[idxValNom]), code: (idxValCode > -1 ? String(row[idxValCode]) : "") });
    }
  }
  return result;
}

// --- VERIFICATION (Utilisées par Controller_Programme) ---

function checkAdminCode(inputCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONFIG);
  var realCode = String(sheet.getRange("H1").getValue());
  return (String(inputCode) === realCode);
}

function verifyValidatorCode(name, inputCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONFIG);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  
  var data = sheet.getRange(2, 9, lastRow - 1, 2).getValues();
  var cleanName = String(name).trim().toLowerCase();
  var cleanInput = String(inputCode).trim();

  for (var i = 0; i < data.length; i++) {
    var dbName = String(data[i][0]).trim().toLowerCase();
    var dbCode = String(data[i][1]).trim();
    if (dbName === cleanName && dbCode === cleanInput) return true;
  }
  return false;
}

function verifyResponsableCode(inputCode) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONFIG);
  var codeTeam = String(sheet.getRange("H2").getValue()).trim();
  var codeResp = String(sheet.getRange("G2").getValue()).trim();
  var input = String(inputCode).trim();
  return (input !== "" && (input === codeTeam || input === codeResp));
}

// --- ECRITURE ---

function saveConfigFull(adminCode, data) {
  if (!checkAdminCode(adminCode)) throw new Error("Code Administrateur incorrect !");

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CONFIG);
  
  // Sauvegarde Params
  if (typeof data.respCode !== 'undefined') sheet.getRange("H2").setValue(String(data.respCode));
  if (typeof data.pdfFolderId !== 'undefined') sheet.getRange("G3").setValue(data.pdfFolderId);
  if (typeof data.pdfTemplateId !== 'undefined') sheet.getRange("H3").setValue(data.pdfTemplateId);

  var headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
  var colRoles = headers.indexOf("Liste_Roles") + 1;
  var colType = headers.indexOf("Type_Role") + 1;
  var colNoms = headers.indexOf("Liste_Noms") + 1;
  var colValNom = headers.indexOf("Liste_Valideurs") + 1;
  var colValCode = headers.indexOf("Code_Valideurs") + 1;

  // CORRECTION MAJEURE : On vide jusqu'à la fin de la feuille pour éviter les résidus
  var maxRows = sheet.getMaxRows(); 
  
  function clearColumn(colIdx) {
      if(colIdx > 0) sheet.getRange(2, colIdx, maxRows - 1, 1).clearContent();
  }

  clearColumn(colRoles);
  clearColumn(colType);
  clearColumn(colNoms);
  clearColumn(colValNom);
  clearColumn(colValCode);

  // Write Lists
  if (data.roles && data.roles.length > 0 && colRoles > 0) {
      sheet.getRange(2, colRoles, data.roles.length, 1).setValues(data.roles.map(r => [r.name]));
      if(colType > 0) sheet.getRange(2, colType, data.roles.length, 1).setValues(data.roles.map(r => [r.type]));
  }
  
  if (data.noms && data.noms.length > 0 && colNoms > 0) {
      sheet.getRange(2, colNoms, data.noms.length, 1).setValues(data.noms.map(n => [n]));
  }
  
  if (data.valideurs && data.valideurs.length > 0 && colValNom > 0) {
      sheet.getRange(2, colValNom, data.valideurs.length, 1).setValues(data.valideurs.map(v => [v.nom]));
      if(colValCode > 0) sheet.getRange(2, colValCode, data.valideurs.length, 1).setValues(data.valideurs.map(v => [v.code]));
  }

  return "Configuration sauvegardée.";
}

function saveConfigNamesBackend(nomsList) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME_CONFIG);
    var headers = sheet.getRange(1, 1, 1, 10).getValues()[0];
    var colNoms = headers.indexOf("Liste_Noms") + 1;
    
    if (colNoms > 0) {
        var maxRows = sheet.getMaxRows();
        sheet.getRange(2, colNoms, maxRows - 1, 1).clearContent();
        if (nomsList && nomsList.length > 0) {
            sheet.getRange(2, colNoms, nomsList.length, 1).setValues(nomsList.map(n => [n]));
        }
    }
    return "OK";
}