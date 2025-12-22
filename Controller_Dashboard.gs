var SHEET_NAME_PLANNING = "DB_PLANNING";
var SHEET_NAME_PROGRAMMES = "DB_PROGRAMMES";
var SHEET_NAME_CHANTS = "DB_CHANTS";
var SHEET_NAME_CONFIG = "CONFIG";

function getDashboardData() {
  var result = {
    nextCulte: null,
    stats: { missingTone: 0, missingTrans: 0, draftProgs: 0 }
  };

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- 1. PRE-CHARGEMENT ---
  var songMap = {};
  var sheetChants = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (sheetChants && sheetChants.getLastRow() > 1) {
    var dataC = sheetChants.getRange(2, 1, sheetChants.getLastRow() - 1, 7).getValues();
    for (var i = 0; i < dataC.length; i++) {
      var id = String(dataC[i][0]).trim();
      var tonalite = dataC[i][4] ? String(dataC[i][4]).trim() : "";
      var mg = dataC[i][5] ? String(dataC[i][5]) : "";
      var fr = dataC[i][6] ? String(dataC[i][6]) : "";
      var nbMg = mg.split(" /// ").filter(function(t){return t.trim().length>0}).length;
      var nbFr = fr.split(" /// ").filter(function(t){return t.trim().length>0}).length;
      var isTransOk = !(nbMg > 0 && (nbFr === 0 || nbMg > nbFr));

      songMap[id] = { hasTone: (tonalite !== ""), isTransOk: isTransOk };
      
      if (tonalite === "") result.stats.missingTone++;
      if (!isTransOk) result.stats.missingTrans++;
    }
  }

  var roleCategoryMap = {};
  var sheetConfig = ss.getSheetByName(SHEET_NAME_CONFIG);
  if (sheetConfig) {
      var lastRowCfg = sheetConfig.getLastRow();
      if (lastRowCfg > 1) {
          var dataCfg = sheetConfig.getRange(2, 2, lastRowCfg - 1, 2).getValues();
          dataCfg.forEach(function(row) {
              if (row[0]) {
                  var key = String(row[0]).trim().toLowerCase();
                  roleCategoryMap[key] = row[1] ? String(row[1]).trim().toUpperCase() : "AUTRE";
              }
          });
      }
  }

  // --- 2. NEXT CULTE ---
  var sheetPlan = ss.getSheetByName(SHEET_NAME_PLANNING);
  if (sheetPlan && sheetPlan.getLastRow() > 1) {
    var now = new Date(); now.setHours(0,0,0,0);
    var dataPlan = sheetPlan.getDataRange().getValues();
    var candidates = [];
    
    for(var k=1; k<dataPlan.length; k++) {
      var dStr = formatDateRobust(dataPlan[k][0]);
      var dObj = parseDateRobust(dStr);
      if(dObj && dObj >= now) {
         candidates.push({
           dateObj: dObj, dateStr: dStr,
           heure: formatTimeRobust(dataPlan[k][1]),
           titre: dataPlan[k][2] || "Culte",
           role: dataPlan[k][4], nom: dataPlan[k][5]
         });
      }
    }
    
    if (candidates.length > 0) {
      candidates.sort(function(a,b) { return a.dateObj - b.dateObj; });
      var nextDate = candidates[0].dateStr;
      var dayEvents = candidates.filter(function(c) { return c.dateStr === nextDate; });
      
      var uniqueHeures = [];
      var equipes = {}; 
      
      dayEvents.forEach(function(ev) {
         if (uniqueHeures.indexOf(ev.heure) === -1) uniqueHeures.push(ev.heure);
         if (!equipes[ev.heure]) equipes[ev.heure] = {};
         
         if (ev.role && ev.nom && ev.role !== "_INIT_" && ev.role !== "System") {
             var roleKey = String(ev.role).trim().toLowerCase();
             var cat = roleCategoryMap[roleKey] || "AUTRE";
             if (!equipes[ev.heure][cat]) equipes[ev.heure][cat] = [];
             equipes[ev.heure][cat].push({ role: ev.role, nom: ev.nom }); 
         }
      });
      uniqueHeures.sort();

      // Programme Analysis
      var progId = null;
      var themeMg = "", themeFr = "";
      var status = "missing"; 
      var songAlerts = { missingToneIds: [], missingTransIds: [], totalSongs: 0 };
      
      var sheetProg = ss.getSheetByName(SHEET_NAME_PROGRAMMES);
      if(sheetProg) {
         var dataPr = sheetProg.getDataRange().getValues();
         
         // --- CORRECTION COMPTEUR BROUILLONS FUTURS ---
         for(var d=1; d<dataPr.length; d++) {
             // Date Programme (Col B / Index 1)
             var dProg = parseDateRobust(formatDate_Prog(dataPr[d][1]));
             // Statut (Col H / Index 7)
             if(dataPr[d][7] === 'draft' && dProg && dProg >= now) {
                 result.stats.draftProgs++;
             }
         }
         // ---------------------------------------------

         for(var p=1; p<dataPr.length; p++) {
             var pDate = formatDate_Prog(parseDate_Prog(dataPr[p][1]));
             if(pDate === nextDate) {
                 progId = dataPr[p][0];
                 themeMg = dataPr[p][3];
                 themeFr = dataPr[p][4];
                 status = dataPr[p][7] || "draft";
                 
                 try {
                     var blocks = JSON.parse(dataPr[p][5]);
                     blocks.forEach(function(b) {
                         if (b.type === 'CHANT' && b.data && b.data.id) {
                             songAlerts.totalSongs++;
                             var currentId = String(b.data.id).trim(); 
                             var sInfo = songMap[currentId];
                             if (sInfo) {
                                 if (!sInfo.hasTone) songAlerts.missingToneIds.push(currentId);
                                 if (!sInfo.isTransOk) songAlerts.missingTransIds.push(currentId);
                             }
                         }
                     });
                 } catch(e) {}
                 break;
             }
         }
      }
      
      result.nextCulte = {
          date: nextDate,
          titre: dayEvents[0].titre,
          horaires: uniqueHeures,
          equipes: equipes,
          progId: progId,
          status: status,
          theme_mg: themeMg,
          theme_fr: themeFr,
          songAlerts: songAlerts
      };
    }
  }

  return result;
}