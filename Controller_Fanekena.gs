var SHEET_NAME_FANEKENA = "DB_FANEKENA";
function getFanekenaList() {
var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName(SHEET_NAME_FANEKENA);
if (!sheet) return [];
var lastRow = sheet.getLastRow();
if (lastRow < 2) return [];
// On récupère ID et Titre uniquement pour la liste
var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
return data.map(function(row) {
return { id: row[0], titre: row[1] };
});
}
function getFanekenaDetails(id) {
var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName(SHEET_NAME_FANEKENA);
if (!sheet) return null;
var data = sheet.getDataRange().getValues();
for (var i = 1; i < data.length; i++) {
if (String(data[i][0]) === String(id)) {
return {
id: data[i][0],
titre: data[i][1],
contenu_mg: data[i][2],
contenu_fr: data[i][3],
rowIndex: i + 1
};
}
}
return null;
}
function saveFanekenaBackend(form) {
var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName(SHEET_NAME_FANEKENA);
if (!sheet) sheet = ss.insertSheet(SHEET_NAME_FANEKENA);
if (form.rowIndex) {
var row = parseInt(form.rowIndex);
sheet.getRange(row, 2).setValue(form.titre);
sheet.getRange(row, 3).setValue(form.contenu_mg);
sheet.getRange(row, 4).setValue(form.contenu_fr);
return "Modification enregistrée";
} else {
var newId = "FNK_" + new Date().getTime();
sheet.appendRow([newId, form.titre, form.contenu_mg, form.contenu_fr]);
return "Nouveau texte créé";
}
}
function deleteFanekenaBackend(id) {
var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName(SHEET_NAME_FANEKENA);
var data = sheet.getDataRange().getValues();
for (var i = 1; i < data.length; i++) {
if (String(data[i][0]) === String(id)) {
sheet.deleteRow(i + 1);
return "Supprimé";
}
}
return "Erreur";
}