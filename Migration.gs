// ==========================================
// FICHIER : Migration.gs (NOUVEAU FICHIER - À exécuter manuellement une seule fois)
// ==========================================

function runAbsoluteDatabaseMigration() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // --- PHASE 1 : GÉNÉRATION DES IDs DANS LA CONFIG ---
  function generateIdsForSheet(sheetName, prefix) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;
    
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    var hasModifications = false;
    
    for (var i = 0; i < data.length; i++) {
      if (!data[i][0] && data[i][1]) { // Si l'ID est vide mais qu'il y a un nom
        data[i][0] = prefix + (i + 1);
        hasModifications = true;
      }
    }
    if (hasModifications) {
      sheet.getRange(2, 1, lastRow - 1, 2).setValues(data);
    }
  }

  Logger.log("1. Génération des IDs de configuration...");
  generateIdsForSheet("CFG_ROLES", "ROL_");
  generateIdsForSheet("CFG_NOMS", "PRT_");
  generateIdsForSheet("CFG_RECUEILS", "REC_");
  generateIdsForSheet("CFG_VALIDEURS", "VAL_");

  // On force le rechargement du dictionnaire avec les nouveaux IDs
  DICT_CACHE = null; 
  getDictionaries();

  // --- PHASE 2 : MIGRATION DB_PLANNING ---
  Logger.log("2. Migration de DB_PLANNING...");
  var sheetPlan = ss.getSheetByName("DB_PLANNING"); // À adapter si la constante est différente
  if (sheetPlan && sheetPlan.getLastRow() > 1) {
    var range = sheetPlan.getRange(2, 5, sheetPlan.getLastRow() - 1, 2); // Colonnes E et F
    var data = range.getValues();
    for (var i = 0; i < data.length; i++) {
      data[i][0] = getIdFromText("roles", data[i][0]); // Col E: Rôle
      data[i][1] = getIdFromText("noms", data[i][1]);  // Col F: Nom
    }
    range.setValues(data);
  }

  // --- PHASE 3 : MIGRATION DB_CHANTS ---
  Logger.log("3. Migration de DB_CHANTS...");
  var sheetChants = ss.getSheetByName("DB_CHANTS");
  if (sheetChants && sheetChants.getLastRow() > 1) {
    var range = sheetChants.getRange(2, 2, sheetChants.getLastRow() - 1, 1); // Colonne B
    var data = range.getValues();
    for (var i = 0; i < data.length; i++) {
      data[i][0] = getIdFromText("recueils", data[i][0]);
    }
    range.setValues(data);
  }

  // --- PHASE 4 : MIGRATION DB_PROGRAMMES (Valideur) ---
  Logger.log("4. Migration de DB_PROGRAMMES...");
  var sheetProg = ss.getSheetByName("DB_PROGRAMMES");
  if (sheetProg && sheetProg.getLastRow() > 1) {
    var range = sheetProg.getRange(2, 9, sheetProg.getLastRow() - 1, 1); // Colonne I
    var data = range.getValues();
    for (var i = 0; i < data.length; i++) {
      data[i][0] = getIdFromText("valideurs", data[i][0]);
    }
    range.setValues(data);
  }

  Logger.log("Migration terminée avec succès !");
}