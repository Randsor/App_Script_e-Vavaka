/* Controller_Programme.gs */

var SHEET_NAME_PROGRAMMES = "DB_PROGRAMMES";
var SHEET_NAME_PLANNING = "DB_PLANNING";
var SHEET_NAME_TEMPLATES = "DB_TEMPLATES";
var SHEET_NAME_FANEKENA = "DB_FANEKENA"; 

function getMonthOverview(month, year) { try { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheetPlan = ss.getSheetByName(SHEET_NAME_PLANNING); var sheetProg = ss.getSheetByName(SHEET_NAME_PROGRAMMES); var mapByDate = {}; if (sheetPlan && sheetPlan.getLastRow() > 1) { var dataP = sheetPlan.getDataRange().getValues(); for (var i = 1; i < dataP.length; i++) { var row = dataP[i]; if (!row[0]) continue; var d = parseDate_Prog(row[0]); if (d && d.getMonth() === month && d.getFullYear() === year) { var dateStr = formatDate_Prog(d); var heureStr = formatTime_Prog(row[1]); var titrePlan = row[2] || "Culte"; if (!mapByDate[dateStr]) { mapByDate[dateStr] = { date: dateStr, dateObj: d.getTime(), horaires: [], titre: titrePlan, progId: null, status: 'missing' }; } if (mapByDate[dateStr].horaires.indexOf(heureStr) === -1) { mapByDate[dateStr].horaires.push(heureStr); } if (row[2]) mapByDate[dateStr].titre = row[2]; } } } if (sheetProg && sheetProg.getLastRow() > 1) { var dataPr = sheetProg.getDataRange().getValues(); for (var j = 1; j < dataPr.length; j++) { if(!dataPr[j][1]) continue; var dProg = parseDate_Prog(dataPr[j][1]); if (dProg && dProg.getMonth() === month && dProg.getFullYear() === year) { var dateStrP = formatDate_Prog(dProg); if (!mapByDate[dateStrP]) { mapByDate[dateStrP] = { date: dateStrP, dateObj: dProg.getTime(), horaires: ["--:--"], titre: dataPr[j][2], progId: null, status: 'missing' }; } mapByDate[dateStrP].progId = dataPr[j][0]; mapByDate[dateStrP].status = dataPr[j][7] || "draft"; } } } var result = []; for (var key in mapByDate) { var item = mapByDate[key]; item.horaires.sort(); result.push({ date: item.date, dateObj: item.dateObj, horaires: item.horaires, titre: item.titre, progId: item.progId, status: item.status }); } result.sort(function(a,b) { return a.dateObj - b.dateObj; }); return result; } catch (e) { return [{ error: true, msg: e.toString() }]; } }
function getNextComingCulte() { try { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheetPlan = ss.getSheetByName(SHEET_NAME_PLANNING); var sheetProg = ss.getSheetByName(SHEET_NAME_PROGRAMMES); var now = new Date(); now.setHours(0,0,0,0); if (!sheetPlan || sheetPlan.getLastRow() < 2) return { found: false, reason: "Planning vide" }; var dataP = sheetPlan.getDataRange().getValues(); var candidates = []; for(var i=1; i<dataP.length; i++) { var d = parseDate_Prog(dataP[i][0]); if(d && d >= now) { candidates.push({ dateObj: d, date: formatDate_Prog(d), heure: formatTime_Prog(dataP[i][1]), titre: dataP[i][2] || "Culte" }); } } if(candidates.length === 0) return { found: false }; candidates.sort(function(a,b) { return a.dateObj - b.dateObj; }); var first = candidates[0]; var sameDay = candidates.filter(function(c) { return c.date === first.date; }); var allHeures = sameDay.map(function(c) { return c.heure; }); var uniqueHeures = allHeures.filter(function(item, pos) { return allHeures.indexOf(item) == pos; }).sort(); var status = "missing"; var progId = null; var themeMG = ""; var themeFR = ""; var titreDef = first.titre; if(sheetProg && sheetProg.getLastRow() > 1) { var dataPr = sheetProg.getDataRange().getValues(); for(var j=1; j<dataPr.length; j++) { if(dataPr[j][1] && formatDate_Prog(parseDate_Prog(dataPr[j][1])) === first.date) { progId = dataPr[j][0]; themeMG = dataPr[j][3]; themeFR = dataPr[j][4]; status = dataPr[j][7] || "draft"; break; } } } return { found: true, date: first.date, titre: titreDef, theme_mg: themeMG, theme_fr: themeFR, horaires: uniqueHeures, status: status, progId: progId }; } catch(e) { return { found: false, error: e.toString() }; } }

// =========================================================
//  2. DETAILS (HYDRATATION FANEKENA + PDF LINK)
// =========================================================
function getProgrammeDetails(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetProg = ss.getSheetByName(SHEET_NAME_PROGRAMMES);
  var sheetPlan = ss.getSheetByName(SHEET_NAME_PLANNING);
  
  if (!sheetProg) return null;
  var dataP = sheetProg.getDataRange().getValues();
  var prog = null;
  
  // Recherche du programme
  for (var i = 1; i < dataP.length; i++) {
    // Comparaison souple sur l'ID Programme
    if (String(dataP[i][0]).trim() === String(id).trim()) {
      
      var settings = {};
      try { settings = JSON.parse(dataP[i][6]); } catch(e) {} 

      var dateStr = formatDate_Prog(dataP[i][1]);
      var liveTitle = getPlanningTitleForDate(dateStr) || dataP[i][2];

      // --- 1. CHARGEMENT DU JSON STOCKÉ (L'archive) ---
      var blocks = [];
      try { blocks = JSON.parse(dataP[i][5]); } catch(e) { blocks = []; }

      // --- 2. PRÉPARATION DE LA SOURCE DE VÉRITÉ (DB_CHANTS) ---
      // On charge toute la base en mémoire pour hydrater rapidement
      var sheetChants = ss.getSheetByName("DB_CHANTS");
      var songMap = {};
      
      if (sheetChants) {
          var dataC = sheetChants.getDataRange().getValues();
          for (var c = 1; c < dataC.length; c++) {
              // CRITIQUE : On convertit l'ID de la DB en String propre pour la comparaison
              var dbId = String(dataC[c][0]).trim();
              
              songMap[dbId] = {
                  recueil: dataC[c][1], 
                  numero: dataC[c][2], 
                  titre: dataC[c][3], 
                  tonalite: dataC[c][4],
                  paroles_mg: dataC[c][5], 
                  paroles_fr: dataC[c][6], 
                  structure: dataC[c][7],
                  // Calcul à la volée du statut
                  transStatus: (function(mg, fr){ 
                      var nMg=(mg||"").split(" /// ").length; 
                      var nFr=(fr||"").split(" /// ").length; 
                      if(nMg>1 && nFr<=1) return 'none'; 
                      if(nMg>nFr) return 'partial'; 
                      return 'ok'; 
                  })(dataC[c][5], dataC[c][6])
              };
          }
      }
      
      // --- 3. PRÉPARATION DE LA SOURCE DE VÉRITÉ (DB_FANEKENA) ---
      var sheetFnk = ss.getSheetByName(SHEET_NAME_FANEKENA);
      var fnkMap = {};
      if (sheetFnk) {
          var dataF = sheetFnk.getDataRange().getValues();
          for(var f=1; f<dataF.length; f++) {
              var fId = String(dataF[f][0]).trim();
              fnkMap[fId] = {
                  titre: dataF[f][1],
                  contenu_mg: dataF[f][2],
                  contenu_fr: dataF[f][3]
              };
          }
      }

      // --- 4. HYDRATATION (ÉCRASEMENT DES DONNÉES JSON PAR LA DB) ---
      blocks.forEach(function(block) {
          
          // Vérification si le bloc est lié à une ID
          var blockId = (block.data && block.data.id) ? String(block.data.id).trim() : null;

          // CAS A : CHANT LIÉ -> ON FORCE LA MISE À JOUR
          if (block.type === 'CHANT' && blockId && songMap[blockId]) {
              var freshSong = songMap[blockId];
              
              // 1. Mise à jour des métadonnées (Titre, Tonalité, etc.)
              block.data.titre = freshSong.titre; 
              block.data.recueil = freshSong.recueil; 
              block.data.numero = freshSong.numero; 
              block.data.tonalite = freshSong.tonalite; 
              block.data.transStatus = freshSong.transStatus;

              // 2. Reconstruction Intégrale des Paroles
              // On utilise la "Sequence" stockée dans le JSON (quels couplets ?)
              // Mais on prend le TEXTE dans la "freshSong" (DB)
              var sequenceIndices = block.data.sequence;
              
              // Sécurité : si pas de séquence définie, on ne peut pas reconstruire précisément,
              // on garde l'ancien texte (ou on pourrait tout charger par défaut)
              if (sequenceIndices && Array.isArray(sequenceIndices)) {
                  
                  var textMGArr = (freshSong.paroles_mg || "").split(" /// "); 
                  var textFRArr = (freshSong.paroles_fr || "").split(" /// "); 
                  var structArr = (freshSong.structure || "").split(",");
                  
                  var fullTextMG = ""; 
                  var fullTextFR = ""; 
                  var displayLabels = {}; 
                  var cCount = 1;
                  
                  // Recalcul des labels (Andininy 1, 2...) basé sur la structure fraîche de la DB
                  structArr.forEach(function(t, idx) { 
                      var type = t.trim().toUpperCase(); 
                      if(type === 'C') displayLabels[idx] = cCount++ + ". "; 
                      else if(type === 'R') displayLabels[idx] = "Ref. "; 
                      else displayLabels[idx] = ""; 
                  });
                  
                  // Réassemblage du texte
                  sequenceIndices.forEach(function(idx, k) { 
                      // On vérifie que l'index existe encore dans le chant (cas où on a supprimé un couplet en DB)
                      if (textMGArr[idx] !== undefined) { 
                          var txtM = (textMGArr[idx] || "").trim(); 
                          var txtF = (textFRArr[idx] || "").trim(); 
                          var label = displayLabels[idx] || ""; 
                          
                          if (k > 0) { fullTextMG += "\n\n"; fullTextFR += "\n\n"; } 
                          
                          fullTextMG += label + txtM; 
                          if (txtF !== "") { fullTextFR += label + txtF; } 
                      } 
                  });
                  
                  // ÉCRASEMENT DU TEXTE JSON PAR LE TEXTE DB RECONSTRUIT
                  block.data.paroles_fixe = fullTextMG; 
                  block.data.paroles_fr_fixe = fullTextFR;
              }
          }
          
          // CAS B : FANEKENA LIÉ -> ON FORCE LA MISE À JOUR
          if (block.type === 'FANEKENA' && blockId && fnkMap[blockId]) {
              var freshFnk = fnkMap[blockId];
              block.data.titre = freshFnk.titre;
              block.data.contenu_mg = freshFnk.contenu_mg;
              block.data.contenu_fr = freshFnk.contenu_fr;
          }
      });

      var hydratedContent = JSON.stringify(blocks);
      var pdfLink = (dataP[i].length > 9) ? dataP[i][9] : "";

      prog = {
        id: dataP[i][0], 
        date: dateStr, 
        titre: liveTitle, 
        theme_mg: dataP[i][3], 
        theme_fr: dataP[i][4], 
        contenu: hydratedContent, 
        settings: settings,
        status: dataP[i][7] || "draft", 
        validatedBy: dataP[i][8] || "", 
        pdfLink: pdfLink,
        rowIndex: i + 1
      };
      break;
    }
  }
  if (!prog) return null;

  var multiEquipe = {}; 
  if (sheetPlan) {
      var dataPlan = sheetPlan.getDataRange().getValues();
      for(var k=1; k<dataPlan.length; k++) {
          if(formatDate_Prog(dataPlan[k][0]) === prog.date) {
              var h = formatTime_Prog(dataPlan[k][1]);
              var role = String(dataPlan[k][4]).trim();
              var nom = String(dataPlan[k][5]).trim();
              if(!multiEquipe[h]) multiEquipe[h] = {};
              if(role && role !== "_INIT_") multiEquipe[h][role] = nom;
          }
      }
  }
  prog.equipes = multiEquipe;
  return prog;
}

// ... (createNewProgramme, saveProgrammeBackend, etc. inchangés) ...
function createNewProgramme(params) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheetProg = ss.getSheetByName(SHEET_NAME_PROGRAMMES); var data = sheetProg.getDataRange().getValues(); for(var i=1; i<data.length; i++) { if(formatDate_Prog(data[i][1]) === params.date) { return { success: true, id: data[i][0], message: "Programme existant ouvert" }; } } var dateObj = parseDate_Prog(params.date); var blocks = []; var settings = { subTitle: "", requiredRoles: [] }; var titreCulte = getPlanningTitleForDate(params.date) || "Culte"; if (params.method === 'template') { var sheetTpl = ss.getSheetByName(SHEET_NAME_TEMPLATES); var tplData = sheetTpl.getDataRange().getValues(); for(var i=1; i<tplData.length; i++) { if(String(tplData[i][0]) === String(params.sourceId)) { try { var struct = JSON.parse(tplData[i][2]); blocks = struct.blocks || []; if(struct.settings) { settings.subTitle = struct.settings.subTitle || ""; settings.requiredRoles = struct.settings.requiredRoles || []; } } catch(e){} break; } } } else if (params.method === 'duplicate') { for(var j=1; j<data.length; j++) { if(String(data[j][0]) === String(params.sourceId)) { try { blocks = JSON.parse(data[j][5]); var oldSettings = {}; try { oldSettings = JSON.parse(data[j][6]); } catch(e){} settings.subTitle = oldSettings.subTitle || ""; settings.requiredRoles = oldSettings.requiredRoles || []; } catch(e){} break; } } } syncTitleToPlanningFullDay(dateObj, titreCulte); var newId = "PROG_" + params.date.replace(/\//g,'') + "_" + new Date().getTime().toString().substr(-4); sheetProg.appendRow([ newId, dateObj, titreCulte, "", "", JSON.stringify(blocks), JSON.stringify(settings), "draft", "", "" ]); return { success: true, id: newId }; }
function getPlanningTitleForDate(dateStr) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(SHEET_NAME_PLANNING); if (!sheet) return null; var data = sheet.getDataRange().getValues(); for(var i=1; i<data.length; i++) { if(formatDate_Prog(data[i][0]) === dateStr) { if(data[i][2] && data[i][2] !== "") return data[i][2]; } } return null; }
function saveProgrammeBackend(form) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(SHEET_NAME_PROGRAMMES); if (form.rowIndex) { var row = parseInt(form.rowIndex); var newStatus = "draft"; sheet.getRange(row, 3).setValue(form.titre); sheet.getRange(row, 4).setValue(form.theme_mg); sheet.getRange(row, 5).setValue(form.theme_fr); sheet.getRange(row, 6).setValue(form.contenu); sheet.getRange(row, 7).setValue(form.settings); sheet.getRange(row, 8).setValue(newStatus); sheet.getRange(row, 9).clearContent(); var dateVal = sheet.getRange(row, 2).getValue(); syncTitleToPlanningFullDay(dateVal, form.titre); return { success: true, status: "draft" }; } return { success: false, msg: "ID manquant" }; }
function syncTitleToPlanningFullDay(dateObj, newTitle) { if (!dateObj || !newTitle) return; var dateStr = formatDate_Prog(dateObj); var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheetPlan = ss.getSheetByName(SHEET_NAME_PLANNING); if (!sheetPlan) return; var data = sheetPlan.getDataRange().getValues(); for(var i=1; i<data.length; i++) { if(formatDate_Prog(data[i][0]) === dateStr) { if (data[i][2] !== newTitle) { sheetPlan.getRange(i+1, 3).setValue(newTitle); } } } }
function checkAuthForUnlock(authType, authName, inputCode) { if (authType === 'EQUIPE') return verifyResponsableCode(inputCode); else if (authType === 'VALIDEUR') return verifyValidatorCode(authName, inputCode); return false; }
function validateProgrammeBackend(id, validName, validCode) { var isOk = verifyValidatorCode(validName, validCode); if (!isOk) throw new Error("Code de validation incorrect."); var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(SHEET_NAME_PROGRAMMES); var data = sheet.getDataRange().getValues(); for(var i=1; i<data.length; i++) { if(String(data[i][0]) === String(id)) { sheet.getRange(i+1, 8).setValue("final"); sheet.getRange(i+1, 9).setValue(validName + " le " + formatDate_Prog(new Date())); return { success: true, status: "final" }; } } throw new Error("Programme introuvable."); }
function deleteProgrammeBackend(id) { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(SHEET_NAME_PROGRAMMES); var data = sheet.getDataRange().getValues(); for(var i=1; i<data.length; i++) { if(String(data[i][0]) === String(id)) { sheet.deleteRow(i+1); return true; } } return false; }
function getArchivedProgrammesList() { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(SHEET_NAME_PROGRAMMES); if (!sheet) return []; var data = sheet.getDataRange().getValues(); var list = []; for(var i=1; i<data.length; i++) { list.push({ id: data[i][0], date: formatDate_Prog(data[i][1]), titre: data[i][2], status: data[i][7] }); } return list.sort((a,b) => parseDate_Prog(b.date) - parseDate_Prog(a.date)); }
function searchArchivedProgrammes(query) { var list = getArchivedProgrammesList(); if (!query) return list.slice(0, 10); var q = query.toLowerCase(); return list.filter(function(p) { return (p.date.indexOf(q) > -1) || (p.titre && p.titre.toLowerCase().indexOf(q) > -1); }).slice(0, 15); }
function getSelectableTemplates() { var ss = SpreadsheetApp.getActiveSpreadsheet(); var sheet = ss.getSheetByName(SHEET_NAME_TEMPLATES); if (!sheet) return []; var data = sheet.getDataRange().getValues(); var list = []; for (var i = 1; i < data.length; i++) { if(data[i][0] && data[i][1]) { list.push({ id: data[i][0], titre: data[i][1], desc: "Template" }); } } return list; }
function formatDate_Prog(val) { if (!val) return ""; if (val instanceof Date) return ("0" + val.getDate()).slice(-2) + "/" + ("0" + (val.getMonth() + 1)).slice(-2) + "/" + val.getFullYear(); return String(val); }
function parseDate_Prog(val) { if (!val) return null; if (val instanceof Date) return val; if (typeof val === 'string') { var parts = val.split("/"); if (parts.length === 3) return new Date(parts[2], parts[1]-1, parts[0]); var d = new Date(val); if (!isNaN(d.getTime())) return d; } return null; }
function formatTime_Prog(val) { if (val instanceof Date) return ("0" + val.getHours()).slice(-2) + ":" + ("0" + val.getMinutes()).slice(-2); var s = String(val).trim(); return s.length >= 5 ? s.substring(0, 5) : (s || "00:00"); }