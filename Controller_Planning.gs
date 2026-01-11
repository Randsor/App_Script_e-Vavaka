var SHEET_NAME_PLANNING = "DB_PLANNING";

// --- API FRONTEND ---

// Paramètres minDays / maxDays pour le chargement progressif
function getPlanningMatrixData(minDays, maxDays) {
  var response = { events: [], roles: [], noms: [] };
  
  if (minDays === undefined) minDays = -30;
  if (maxDays === undefined) maxDays = 180;

  try {
    if (typeof getConfigData === 'function') {
      var config = getConfigData();
      response.roles = config.roles || [];
      response.noms = config.noms || [];
    }
  } catch (e) {
    console.warn("Erreur lecture Config: " + e);
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  if (!sheet) return response;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return response;

  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var eventsMap = {};
  
  var now = new Date();
  var pastLimit = new Date(now.getTime() + (minDays * 24 * 60 * 60 * 1000));
  var futureLimit = new Date(now.getTime() + (maxDays * 24 * 60 * 60 * 1000));

  pastLimit.setHours(0,0,0,0);
  futureLimit.setHours(23,59,59,999);

  for (var i = 0; i < data.length; i++) {
    try {
      var row = data[i];
      if (!row[0]) continue; 

      var dateStr = formatDateRobust(row[0]);
      if (dateStr === "INVALID") continue;

      var dateObj = parseDateRobust(dateStr);
      if (!dateObj || isNaN(dateObj.getTime())) continue;
      if (dateObj < pastLimit || dateObj > futureLimit) continue;

      var heureStr = formatTimeRobust(row[1]);
      var uniqueKey = dateStr + "_" + heureStr;

      if (!eventsMap[uniqueKey]) {
        eventsMap[uniqueKey] = {
          key: uniqueKey,
          dateObj: dateObj.getTime(), 
          date: dateStr,
          heure: heureStr,
          titre: row[2] || "",
          assignments: {}
        };
      }

      var roleRaw = row[4];
      var nom = row[5];
      
      if (roleRaw) {
        var roleClean = String(roleRaw).trim();
        if (roleClean !== "" && roleClean !== "_INIT_" && roleClean !== "System") {
           eventsMap[uniqueKey].assignments[roleClean] = nom;
        }
      }
    } catch (e) {
      console.error("Erreur ligne " + i + ": " + e);
    }
  }

  var eventsArray = Object.keys(eventsMap).map(function(k) { return eventsMap[k]; });
  
  eventsArray.sort(function(a, b) {
    return a.dateObj - b.dateObj;
  });

  response.events = eventsArray;
  return response;
}

function createPlanningEvent(dateStr, timeStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  if (!sheet) return "Erreur DB";
  
  var dateObj = parseDateFR(dateStr);
  if (!dateObj) return "Date Invalide"; 
  
  sheet.appendRow([dateObj, timeStr, "Culte", "", "_INIT_", "CREATED"]);
  return "OK";
}

function updateEventHeader(dateStr, oldHeure, type, newVal) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  if (!sheet) return "Erreur DB";

  var data = sheet.getDataRange().getValues();
  
  // 1. Mise à jour du Planning
  for(var i=1; i<data.length; i++) {
      var rDate = formatDateRobust(data[i][0]);
      var rHeure = formatTimeRobust(data[i][1]);
      
      if(rDate === dateStr && rHeure === oldHeure) {
          if (type === 'TIME') sheet.getRange(i+1, 2).setValue(newVal); 
          else if (type === 'TITLE') sheet.getRange(i+1, 3).setValue(newVal); 
      }
  }

  // 2. SYNCHRONISATION AVEC LE PROGRAMME (Ajouté)
  // Si on change le TITRE dans le planning, on met à jour le programme correspondant
  if (type === 'TITLE') {
      var sheetProg = ss.getSheetByName("DB_PROGRAMMES");
      if (sheetProg) {
          var dataP = sheetProg.getDataRange().getValues();
          // Parcours des programmes pour trouver celui correspondant à la date
          for(var j=1; j<dataP.length; j++) {
              var progDate = formatDateRobust(dataP[j][1]); // Col B = Date
              if (progDate === dateStr) {
                  // On met à jour le titre (Col C = Index 2)
                  sheetProg.getRange(j+1, 3).setValue(newVal);
              }
          }
      }
  }

  return "OK";
}

function updatePlanningCell(dateStr, heureStr, role, nom) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  if (!sheet) return "Erreur DB";

  var data = sheet.getDataRange().getValues();
  var rowToUpdate = -1;
  var existingTitle = ""; 

  for (var i = 1; i < data.length; i++) {
    var rDate = formatDateRobust(data[i][0]);
    var rHeure = formatTimeRobust(data[i][1]);
    var rRole = data[i][4];

    if (rDate === dateStr && rHeure === heureStr) {
       if(data[i][2]) existingTitle = data[i][2];
    }

    if (rDate === dateStr && rHeure === heureStr && String(rRole).trim() === role) {
      rowToUpdate = i + 1;
      break;
    }
  }

  if (rowToUpdate > 0) {
    sheet.getRange(rowToUpdate, 6).setValue(nom);
  } else {
    var dateObj = parseDateFR(dateStr);
    sheet.appendRow([dateObj, heureStr, existingTitle, "", role, nom]);
  }
  return "OK";
}

function updatePlanningBatch(updates) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  var data = sheet.getDataRange().getValues();
  
  updates.forEach(function(u) {
     var found = false;
     for(var i=1; i<data.length; i++) {
        var rDate = formatDateRobust(data[i][0]);
        var rHeure = formatTimeRobust(data[i][1]);
        var rRole = String(data[i][4]).trim();
        if(rDate === u.date && rHeure === u.heure && rRole === u.role) {
            sheet.getRange(i+1, 6).setValue(u.nom);
            found = true; 
            break;
        }
     }
     if(!found) {
         var title = "";
         for(var k=1; k<data.length; k++) {
             if(formatDateRobust(data[k][0]) === u.date && formatTimeRobust(data[k][1]) === u.heure) {
                 title = data[k][2]; break;
             }
         }
         sheet.appendRow([parseDateFR(u.date), u.heure, title, "", u.role, u.nom]);
     }
  });
  return "OK";
}

// --- UTILITAIRES ROBUSTES ---

function formatDateRobust(val) {
  if (!val) return "INVALID";
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "INVALID";
    var d = val;
    var day = ("0" + d.getDate()).slice(-2);
    var month = ("0" + (d.getMonth() + 1)).slice(-2);
    var year = d.getFullYear();
    return day + "/" + month + "/" + year;
  }
  if (typeof val === 'string' && val.includes('/')) return val.trim();
  return "INVALID";
}

function parseDateRobust(dateStr) {
  try {
    if (!dateStr || dateStr === "INVALID") return null;
    var parts = dateStr.split("/"); 
    if (parts.length < 3) return null;
    var d = new Date(parts[2], parts[1] - 1, parts[0]);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch(e) { return null; }
}

function parseDateFR(dateStr) { return parseDateRobust(dateStr); }

function formatTimeRobust(val) {
  if (!val) return "00:00";
  if (val instanceof Date) {
    var h = ("0" + val.getHours()).slice(-2);
    var m = ("0" + val.getMinutes()).slice(-2);
    return h + ":" + m;
  }
  var s = String(val).trim();
  return s.length >= 5 ? s.substring(0, 5) : s;
}

function generateYearBackend(year) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_PLANNING);
  if (!sheet) return "Erreur: Onglet Planning introuvable";
  
  var y = parseInt(year);
  if (isNaN(y)) return "Année invalide";
  
  // 1. Récupération des dates existantes pour ne pas créer de doublons
  var existingMap = {}; // Format "JJ/MM/AAAA-HH:MM"
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for(var i=0; i<data.length; i++) {
        var dStr = formatDateRobust(data[i][0]);
        var tStr = formatTimeRobust(data[i][1]);
        if(dStr !== "INVALID") existingMap[dStr + "-" + tStr] = true;
    }
  }
  
  var startDate = new Date(y, 0, 1);
  var endDate = new Date(y, 11, 31);
  var entriesToAdd = [];
  
  // Helper d'ajout interne
  function addEntry(dateObj, timeStr, title) {
      var dF = formatDateRobust(dateObj);
      if (!existingMap[dF + "-" + timeStr]) {
          entriesToAdd.push([dateObj, timeStr, title, "", "_INIT_", "System"]);
          existingMap[dF + "-" + timeStr] = true; 
      }
  }

  // Boucle jour par jour
  for (var d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    var isSunday = (d.getDay() === 0);
    var isXmas = (d.getMonth() === 11 && d.getDate() === 25);
    
    // CAS NOEL : 25 Décembre à 15h00
    if (isXmas) {
        addEntry(new Date(d), "15:00", "Krismasy");
    }
    
    // CAS DIMANCHE
    if (isSunday) {
        // Est-ce le 1er dimanche du mois ? (Le jour est <= 7)
        if (d.getDate() <= 7) {
            // 1er Dimanche : 15h30 uniquement ("Fandraisana")
            addEntry(new Date(d), "15:30", "Fandraisana");
        } else {
            // Autres Dimanches : 08h30 ET 11:00
            addEntry(new Date(d), "08:30", "Culte 1");
            addEntry(new Date(d), "11:00", "Culte 2");
        }
    }
  }
  
  // Écriture et Tri (Partie manquante dans ton snippet)
  if (entriesToAdd.length > 0) {
      sheet.getRange(lastRow + 1, 1, entriesToAdd.length, 6).setValues(entriesToAdd);
      
      // Tri chronologique global (Col A puis Col B)
      var fullRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6);
      fullRange.sort([{column: 1, ascending: true}, {column: 2, ascending: true}]);
      
      return "Succès : " + entriesToAdd.length + " créneaux générés pour " + y + ".";
  } else {
      return "Année " + y + " déjà complète.";
  }
}

function deletePlanningEventBackend(dateStr, timeStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetPlan = ss.getSheetByName(SHEET_NAME_PLANNING);
  var sheetProg = ss.getSheetByName("DB_PROGRAMMES"); // Vérif croisée
  
  // 1. Vérification Programme existant
  if (sheetProg) {
    var dataP = sheetProg.getDataRange().getValues();
    for (var j = 1; j < dataP.length; j++) {
      var pDate = formatDateRobust(dataP[j][1]); // Col B = Date
      if (pDate === dateStr) {
        return { success: false, msg: "Impossible de supprimer : Un programme existe déjà pour cette date (" + dataP[j][2] + "). Veuillez supprimer le programme d'abord." };
      }
    }
  }
  
  // 2. Suppression dans Planning
  var data = sheetPlan.getDataRange().getValues();
  var rowsToDelete = [];
  
  // On parcourt à l'envers pour supprimer sans décaler les index
  for (var i = data.length - 1; i >= 1; i--) {
    var rDate = formatDateRobust(data[i][0]);
    var rTime = formatTimeRobust(data[i][1]);
    
    if (rDate === dateStr && rTime === timeStr) {
      sheetPlan.deleteRow(i + 1);
    }
  }
  
  return { success: true, msg: "Créneau du " + dateStr + " à " + timeStr + " supprimé." };
}