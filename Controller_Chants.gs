var SHEET_NAME_CHANTS = "DB_CHANTS";
var SHEET_NAME_CONFIG = "CONFIG";

// 1. RECHERCHE PRINCIPALE
function searchChantsBackend(query, recueilFilter, historyIds) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues(); 

  // CAS DEFAUT
  if ((!query || query === "") && (!recueilFilter || recueilFilter === "") && (!historyIds || historyIds.length === 0)) {
     return data.slice(-20).reverse().map(formatChantLight);
  }
  
  // CAS HISTORIQUE
  if ((!query || query === "") && (!recueilFilter || recueilFilter === "") && historyIds && historyIds.length > 0) {
    var historyChants = data.filter(function(row) {
      return historyIds.includes(String(row[0]));
    });
    return historyChants.map(formatChantLight);
  }

  // CAS RECHERCHE AMÉLIORÉE + SNIPPET
  var q = query ? query.toLowerCase() : "";
  
  var results = data.filter(function(row) {
    // row[1]=Recueil, row[2]=Numero, row[3]=Titre, row[5]=ParolesMG, row[6]=ParolesFR
    var content = (String(row[5] || "") + " " + String(row[6] || "")); // Paroles seules pour le snippet
    var fullIndex = (
      String(row[1] || "") + " " + 
      String(row[2] || "") + " " + 
      String(row[3] || "") + " " + 
      content
    ).toLowerCase();

    var matchRecueil = (recueilFilter && recueilFilter !== "") ? row[1] === recueilFilter : true;
    var matchText = q ? fullIndex.indexOf(q) > -1 : true;
    
    // Génération du Snippet si match dans les paroles
    if (matchText && q.length > 2) {
        var lyricsLower = content.toLowerCase();
        var idx = lyricsLower.indexOf(q);
        if (idx > -1) {
            var start = Math.max(0, idx - 25);
            var end = Math.min(content.length, idx + 35);
            row.snippet = "..." + content.substring(start, end) + "...";
        }
    }
    
    return matchText && matchRecueil;
  });

  // TRI NUMÉRIQUE
  results.sort(function(a, b) {
      if (a[1] === b[1]) {
          return parseInt(a[2]) - parseInt(b[2]);
      }
      return 0;
  });

  return results.slice(0, 20).map(function(row) {
      var c = formatChantLight(row);
      if(row.snippet) c.snippet = row.snippet; // Injection du snippet
      return c;
  });
}

function formatChantLight(row) {
  var mgTxt = row[5] ? String(row[5]) : "";
  var frTxt = row[6] ? String(row[6]) : "";
  var nbMg = mgTxt.split(" /// ").filter(t => t.trim().length > 0).length;
  var nbFr = frTxt.split(" /// ").filter(t => t.trim().length > 0).length;

  var status = "ok";
  if (nbMg > 0 && nbFr === 0) status = "none";
  else if (nbMg > nbFr) status = "partial";

  return {
    id: row[0],
    recueil: row[1],
    numero: row[2],
    titre: row[3],
    hasMG: (nbMg > 0), 
    hasFR: (nbFr > 0),
    transStatus: status
  };
}

// 2. RÉCUPÉRER UN RECUEIL COMPLET
function getChantsByRecueil(recueilName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  var filtered = data.filter(function(row) {
    return row[1] === recueilName;
  });

  filtered.sort(function(a, b) {
    return parseInt(a[2]) - parseInt(b[2]);
  });

  return filtered.map(formatChantLight);
}

// 3. DÉTAILS D'UN CHANT
function getChantDetails(id) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_CHANTS);
  var data = sheet.getDataRange().getValues();
  
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      
      // Calcul statut traduction pour le détail aussi
      var mgTxt = data[i][5] ? String(data[i][5]) : "";
      var frTxt = data[i][6] ? String(data[i][6]) : "";
      var nbMg = mgTxt.split(" /// ").filter(t => t.trim().length > 0).length;
      var nbFr = frTxt.split(" /// ").filter(t => t.trim().length > 0).length;
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
        transStatus: status, // Ajouté ici pour remonter au front
        rowIndex: i + 1
      };
    }
  }
  return null;
}

// 4. SAUVEGARDER LE CHANT
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

// 5. LISTE DES FILTRES
function getRecueilsFilterList() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME_CONFIG);
  if(!sheet) return [];
  var last = sheet.getLastRow();
  if(last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 1).getValues().flat().filter(String);
}