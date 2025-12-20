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