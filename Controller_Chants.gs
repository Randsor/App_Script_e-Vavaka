/**
 * CONTRÔLEUR CHANTS
 * Gestion de la base de données des chants, recherche, filtrage et statistiques.
 */

var SHEET_NAME_CHANTS = "DB_CHANTS";
var SHEET_NAME_CONFIG = "CONFIG";

/**
 * Récupère les statistiques globales du répertoire pour le Dashboard Chants.
 * Calcule : Total, Sans Tonalité, Non Traduit, Traduit Partiellement.
 * 
 * @return {Object} Stats object {total, missingTone, transNone, transPartial}
 */
function getRepoStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  
  if (!sheet || sheet.getLastRow() < 2) {
    return { total: 0, missingTone: 0, transNone: 0, transPartial: 0 };
  }
  
  // Récupération optimisée en une seule lecture
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var total = data.length;
  var missingTone = 0;
  var transNone = 0;
  var transPartial = 0;
  
  for (var i = 0; i < total; i++) {
    var row = data[i];
    
    // Tonalité manquante (Col 4)
    if (!row[4] || String(row[4]).trim() === "") {
      missingTone++;
    }
    
    // Analyse des paroles (Col 5 = MG, Col 6 = FR)
    var mg = row[5] ? String(row[5]) : "";
    var fr = row[6] ? String(row[6]) : "";
    
    var nbMg = mg.split(" /// ").filter(function(t) { return t.trim().length > 0; }).length;
    var nbFr = fr.split(" /// ").filter(function(t) { return t.trim().length > 0; }).length;
    
    if (nbMg > 0) {
      if (nbFr === 0) {
        transNone++;
      } else if (nbMg > nbFr) {
        transPartial++;
      }
    }
  }
  
  return { 
    total: total, 
    missingTone: missingTone, 
    transNone: transNone, 
    transPartial: transPartial 
  };
}

/**
 * Filtre les chants selon un critère de maintenance ou une liste d'IDs spécifique.
 * 
 * @param {string} issueType - Type de problème ('missing_tone', 'trans_none', 'specific_ids'...)
 * @param {Array} idsList - (Optionnel) Liste d'IDs pour le filtrage 'specific_ids'
 */
function getChantsByIssue(issueType, idsList) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  // Sécurisation des IDs entrants
  var safeIds = [];
  if (idsList && Array.isArray(idsList)) {
    safeIds = idsList.map(function(id) { return String(id).trim(); });
  }

  var filtered = data.filter(function(row) {
    // Cas 1 : Filtrage par liste d'IDs (Culte)
    if (issueType === 'specific_ids') {
      if (safeIds.length === 0) return false;
      var rowId = String(row[0]).trim();
      return safeIds.indexOf(rowId) > -1;
    }
    
    // Cas 2 : Maintenance Tonalité
    if (issueType === 'missing_tone') {
      return (!row[4] || String(row[4]).trim() === "");
    }
    
    // Cas 3 : Maintenance Non Traduit
    if (issueType === 'trans_none') {
      var mg = row[5] ? String(row[5]) : "";
      var fr = row[6] ? String(row[6]) : "";
      return (mg.length > 0 && fr.length === 0);
    }
    
    // Cas 4 : Maintenance Traduction Partielle
    if (issueType === 'trans_partial') {
      var mg = row[5] ? String(row[5]) : "";
      var fr = row[6] ? String(row[6]) : "";
      var nbMg = mg.split(" /// ").length;
      var nbFr = fr.split(" /// ").length;
      return (nbMg > nbFr && nbFr > 0);
    }
    
    // Fallback ancien code
    if (issueType === 'missing_trans') {
      var mg = row[5] ? String(row[5]) : "";
      var fr = row[6] ? String(row[6]) : "";
      var nbMg = mg.split(" /// ").length;
      var nbFr = fr.split(" /// ").length;
      return (nbMg > 0 && (nbFr === 0 || nbMg > nbFr));
    }
    
    return false;
  });

  return filtered.map(formatChantLight);
}

/**
 * Recherche principale (Titre, Numéro, Paroles, Recueil)
 * Utilisée aussi bien pour la recherche textuelle que pour le chargement initial.
 * 
 * @param {string} query - Texte à chercher
 * @param {string} recueilFilter - (Obsolète ici, géré en JS, mais gardé pour signature)
 * @param {Array} historyIds - Liste d'IDs à filtrer (Compatibilité)
 */
function searchChantsBackend(query, recueilFilter, historyIds) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // On récupère toutes les colonnes utiles (jusqu'à I pour Tags)
  var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues(); 

  // CAS 1 : Chargement complet (Cache JS)
  if ((!query || query === "") && (!recueilFilter || recueilFilter === "") && (!historyIds || historyIds.length === 0)) {
     // On renvoie TOUT pour permettre le filtrage rapide côté client
     return data.map(formatChantLight);
  }
  
  // CAS 2 : Liste d'IDs spécifiques (Historique ou autre)
  if ((!query || query === "") && (!recueilFilter || recueilFilter === "") && historyIds && historyIds.length > 0) {
    var safeTargetIds = historyIds.map(function(id) { return String(id).trim(); });
    var historyChants = data.filter(function(row) {
      return safeTargetIds.indexOf(String(row[0]).trim()) > -1;
    });
    return historyChants.map(formatChantLight);
  }

  // CAS 3 : Recherche Textuelle (Serveur)
  // Nécessaire quand on veut le snippet des paroles
  var q = query ? query.toLowerCase() : "";
  
  var results = data.filter(function(row) {
    var content = (String(row[5] || "") + " " + String(row[6] || "")); 
    var fullIndex = (
      String(row[1] || "") + " " + // Recueil
      String(row[2] || "") + " " + // Numero
      String(row[3] || "") + " " + // Titre
      content
    ).toLowerCase();

    var matchText = q ? fullIndex.indexOf(q) > -1 : true;
    
    // Génération du Snippet (Aperçu)
    if (matchText && q.length > 2) {
        var lyricsLower = content.toLowerCase();
        var idx = lyricsLower.indexOf(q);
        if (idx > -1) {
            var start = Math.max(0, idx - 25);
            var end = Math.min(content.length, idx + 35);
            row.snippet = "..." + content.substring(start, end) + "...";
        }
    }
    
    return matchText;
  });

  // Tri par défaut (Recueil puis Numéro)
  results.sort(function(a, b) {
      if (a[1] === b[1]) return parseInt(a[2]) - parseInt(b[2]);
      return 0;
  });

  // Limite à 50 résultats pour la recherche serveur (Performance)
  return results.slice(0, 50).map(function(row) {
      var c = formatChantLight(row);
      if (row.snippet) c.snippet = row.snippet; 
      return c;
  });
}

/**
 * Formate une ligne de données en objet léger pour le frontend
 */
function formatChantLight(row) {
  var mgTxt = row[5] ? String(row[5]) : "";
  var frTxt = row[6] ? String(row[6]) : "";
  
  var nbMg = mgTxt.split(" /// ").filter(function(t) { return t.trim().length > 0; }).length;
  var nbFr = frTxt.split(" /// ").filter(function(t) { return t.trim().length > 0; }).length;

  var status = "ok";
  if (nbMg > 0 && nbFr === 0) status = "none";
  else if (nbMg > nbFr) status = "partial";

  return {
    id: row[0],
    recueil: row[1],
    numero: row[2],
    titre: row[3],
    tonalite: row[4],
    hasMG: (nbMg > 0), 
    hasFR: (nbFr > 0),
    transStatus: status
  };
}

// --- UTILITAIRES CRUD (CRUD Standard) ---

function getChantDetails(id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_CHANTS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var mgTxt = data[i][5] ? String(data[i][5]) : "";
      var frTxt = data[i][6] ? String(data[i][6]) : "";
      var nbMg = mgTxt.split(" /// ").filter(function(t) { return t.trim().length > 0; }).length;
      var nbFr = frTxt.split(" /// ").filter(function(t) { return t.trim().length > 0; }).length;
      var status = "ok";
      if (nbMg > 0 && nbFr === 0) status = "none";
      else if (nbMg > nbFr) status = "partial";

      return {
        id: data[i][0],
        recueil: data[i][1],
        numero: data[i][2],
        titre: data[i][3],
        tonalite: data[i][4], 
        paroles_mg: data[i][5],
        paroles_fr: data[i][6],
        structure: data[i][7],
        tags: data[i][8],
        transStatus: status,
        rowIndex: i + 1
      };
    }
  }
  return null;
}

function saveChantBackend(form) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_CHANTS);
  var mgFull = form.strophes_mg.join(" /// ");
  var frFull = form.strophes_fr.join(" /// ");
  var structure = form.types.join(",");

  if (form.rowIndex) {
    var row = parseInt(form.rowIndex);
    sheet.getRange(row, 2).setValue(form.recueil);
    sheet.getRange(row, 3).setValue(form.numero);
    sheet.getRange(row, 4).setValue(form.titre);
    sheet.getRange(row, 5).setValue(form.tonalite); 
    sheet.getRange(row, 6).setValue(mgFull);
    sheet.getRange(row, 7).setValue(frFull);
    sheet.getRange(row, 8).setValue(structure); 
    sheet.getRange(row, 9).setValue(form.tags);
    return "Chant modifié avec succès !";
  } else {
    var prefix = form.recueil ? form.recueil.substring(0, 2).toUpperCase() : "XX";
    var newId = prefix + "_" + form.numero + "_" + new Date().getTime().toString().substr(-5);
    sheet.appendRow([newId, form.recueil, form.numero, form.titre, form.tonalite, mgFull, frFull, structure, form.tags]);
    return "Chant créé avec succès !";
  }
}

function getRecueilsFilterList() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_CONFIG);
  if(!sheet) return [];
  var last = sheet.getLastRow();
  if(last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 1).getValues().flat().filter(String);
}

function getChantsByRecueil(recueilName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var filtered = data.filter(function(row) { return row[1] === recueilName; });
  filtered.sort(function(a, b) { return parseInt(a[2]) - parseInt(b[2]); });
  return filtered.map(formatChantLight);
}