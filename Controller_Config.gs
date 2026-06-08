// ==========================================
// CONFIGURATION DES CONSTANTES DE TABLE
// ==========================================
var SHEET_CFG_RECUEILS   = "CFG_RECUEILS";
var SHEET_CFG_ROLES      = "CFG_ROLES";
var SHEET_CFG_NOMS       = "CFG_NOMS";
var SHEET_CFG_VALIDEURS  = "CFG_VALIDEURS";
var SHEET_CFG_PARAMS     = "CFG_PARAMS";
var SHEET_CFG_SLIDES     = "CFG_SLIDES"; // <--- NOUVEL ONGLET

/**
 * 1. CHARGEMENT DE LA CONFIGURATION
 */
function getConfigData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var recueils = [];
  var roles = [];
  var noms = [];
  var valideurs = [];
  var slideMappings = []; // <--- NOUVEAU
  var paramsMap = {};

  // --- Lecture CFG_RECUEILS (Col A: ID, Col B: Nom, Col C: Préfixe) ---
  var sheetRec = ss.getSheetByName(SHEET_CFG_RECUEILS);
  if (sheetRec) {
    var lastRow = sheetRec.getLastRow();
    if (lastRow > 1) {
      recueils = sheetRec.getRange(2, 1, lastRow - 1, 3).getValues()
        .map(function(r) { 
            return { 
                id: String(r[0] || "").trim(), 
                nom: String(r[1] || "").trim(),
                prefixe: String(r[2] || "").trim()
            }; 
        })
        .filter(function(r) { return r.nom !== ""; });
    }
  }

  // --- Lecture CFG_ROLES (Col A: ID, Col B: Nom, Col C: Type) ---
  var sheetRol = ss.getSheetByName(SHEET_CFG_ROLES);
  if (sheetRol) {
    var lastRow = sheetRol.getLastRow();
    if (lastRow > 1) {
      roles = sheetRol.getRange(2, 1, lastRow - 1, 3).getValues()
        .map(function(r) {
          var valId = String(r[0] || "").trim();
          var valName = String(r[1] || "").trim();
          var valType = String(r[2] || "").trim();
          return { 
            id: valId,
            role: valName, nom: valName, name: valName, Nom_Role: valName, titre: valName,
            type: valType, Type_Role: valType, categorie: valType
          };
        })
        .filter(function(r) { return r.role !== ""; });
    }
  }

  // --- Lecture CFG_NOMS (Col A: ID, Col B: Nom) ---
  var sheetNom = ss.getSheetByName(SHEET_CFG_NOMS);
  if (sheetNom) {
    var lastRow = sheetNom.getLastRow();
    if (lastRow > 1) {
      noms = sheetNom.getRange(2, 1, lastRow - 1, 2).getValues()
        .map(function(r) { 
            return { id: String(r[0] || "").trim(), nom: String(r[1] || "").trim() }; 
        })
        .filter(function(r) { return r.nom !== ""; });
    }
  }

  // --- Lecture CFG_VALIDEURS (Col A: ID, Col B: Nom, Col C: Code) ---
  var sheetVal = ss.getSheetByName(SHEET_CFG_VALIDEURS);
  if (sheetVal) {
    var lastRow = sheetVal.getLastRow();
    if (lastRow > 1) {
      valideurs = sheetVal.getRange(2, 1, lastRow - 1, 3).getValues()
        .map(function(r) {
          var valId = String(r[0] || "").trim();
          var valName = String(r[1] || "").trim();
          var valCode = String(r[2] || "").trim();
          return { 
            id: valId,
            nom: valName, name: valName, Nom_Valideur: valName, valideur: valName,
            code: valCode, Code_Valideur: valCode
          };
        })
        .filter(function(r) { return r.nom !== ""; });
    }
  }

  // --- Lecture CFG_SLIDES (Col A: ID, Col B: TitreMG, Col C: TitreFR, Col D: Tag) ---
  var sheetSld = ss.getSheetByName(SHEET_CFG_SLIDES);
  if (sheetSld) {
    var lastRow = sheetSld.getLastRow();
    if (lastRow > 1) {
      slideMappings = sheetSld.getRange(2, 1, lastRow - 1, 4).getValues()
        .map(function(r) {
          var id = String(r[0] || "").trim();
          var tMg = String(r[1] || "").trim();
          var tFr = String(r[2] || "").trim();
          var tTag = String(r[3] || "").trim();
          
          // AUCUN NETTOYAGE, AUCUN REPLACE DE "TPL_". On renvoie la donnée pure.
          return { 
            id: id,
            titre_mg: tMg,
            titre_fr: tFr,
            tag: tTag
          };
        })
        .filter(function(r) { return r.titre_mg !== "" || r.titre_fr !== ""; });
    }
  }

  // --- Lecture CFG_PARAMS (Clés/Valeurs) ---
  var sheetPar = ss.getSheetByName(SHEET_CFG_PARAMS);
  if (sheetPar) {
    var lastRow = sheetPar.getLastRow();
    if (lastRow > 1) {
      var paramsData = sheetPar.getRange(2, 1, lastRow - 1, 2).getValues();
      paramsData.forEach(function(r) {
        if (r[0]) {
          paramsMap[String(r[0]).trim()] = String(r[1] || "").trim();
        }
      });
    }
  }

  return {
    recueils: recueils,
    roles: roles,
    noms: noms,
    valideurs: valideurs, 
    slideMappings: slideMappings, // <--- NOUVEAU
    respCode: paramsMap["responsable_code"] || "",
    pdfFolderId: paramsMap["pdf_folder_id"] || "",
    pdfTemplateId: paramsMap["pdf_template_id"] || "",
    slidesTemplateSalleId: paramsMap["slides_template_salle_id"] || "",
    slidesFolderId: paramsMap["slides_folder_id"] || ""
  };
}

/**
 * 2. SAUVEGARDE DE LA CONFIGURATION (AVEC GESTION AUTO DES IDs)
 */
function saveConfigFull(adminCode, data) {
  if (!checkAdminCode(adminCode)) {
    return { success: false, msg: "Action non autorisée : Code administrateur incorrect." };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    var dicts = getDictionaries();

    // --- 2.1 Écriture CFG_RECUEILS ---
    var sheetRec = ss.getSheetByName(SHEET_CFG_RECUEILS);
    if (sheetRec && data.recueils !== undefined) {
      clearSheetData(sheetRec, 1);
      if (data.recueils.length > 0) {
        var rows = data.recueils.map(function(r) { 
          var nom = String(r.nom).trim();
          var prefixe = String(r.prefixe || "").trim();
          var id = String(r.id || "").trim();
          if (!id) id = dicts.recueils.textToId[nom.toLowerCase()];
          if (!id) id = "REC_" + Utilities.getUuid().substring(0,6).toUpperCase();
          return [id, nom, prefixe]; 
        });
        sheetRec.getRange(2, 1, rows.length, 3).setValues(rows);
      }
    }

    // --- 2.2 Écriture CFG_ROLES ---
    var sheetRol = ss.getSheetByName(SHEET_CFG_ROLES);
    if (sheetRol && data.roles !== undefined) {
      clearSheetData(sheetRol, 1);
      if (data.roles.length > 0) {
        var rows = data.roles.map(function(r) {
          var roleName = String(r.nom || r.role || r.name || r.Nom_Role || "").trim();
          var roleType = String(r.type || r.Type_Role || r.categorie || "").trim();
          var id = String(r.id || "").trim();
          if (!id) id = dicts.roles.textToId[roleName.toLowerCase()];
          if (!id) id = "ROL_" + Utilities.getUuid().substring(0,6).toUpperCase();
          return [id, roleName, roleType];
        }).filter(function(r) { return r[1] !== ""; });
        if (rows.length > 0) sheetRol.getRange(2, 1, rows.length, 3).setValues(rows);
      }
    }

    // --- 2.3 Écriture CFG_NOMS ---
    var sheetNom = ss.getSheetByName(SHEET_CFG_NOMS);
    if (sheetNom && data.noms !== undefined) {
      clearSheetData(sheetNom, 1);
      if (data.noms.length > 0) {
        var rows = data.noms.map(function(n) { 
          var nom = String(n.nom || n).trim(); 
          var id = String(n.id || "").trim();
          if (!id) id = dicts.noms.textToId[nom.toLowerCase()];
          if (!id) id = "PRT_" + Utilities.getUuid().substring(0,6).toUpperCase();
          return [id, nom]; 
        });
        sheetNom.getRange(2, 1, rows.length, 2).setValues(rows);
      }
    }

    // --- 2.4 Écriture CFG_VALIDEURS ---
    var sheetVal = ss.getSheetByName(SHEET_CFG_VALIDEURS);
    if (sheetVal && data.valideurs !== undefined) {
      clearSheetData(sheetVal, 1);
      if (data.valideurs.length > 0) {
        var rows = data.valideurs.map(function(v) {
          var valName = String(v.nom || v.name || v.Nom_Valideur || v.valideur || "").trim();
          var valCode = String(v.code || v.Code_Valideur || "").trim();
          var id = String(v.id || "").trim();
          if (!id) id = dicts.valideurs.textToId[valName.toLowerCase()];
          if (!id) id = "VAL_" + Utilities.getUuid().substring(0,6).toUpperCase();
          return [id, valName, valCode];
        }).filter(function(r) { return r[1] !== ""; });
        if (rows.length > 0) sheetVal.getRange(2, 1, rows.length, 3).setValues(rows);
      }
    }

    // --- 2.4.bis Écriture CFG_SLIDES (Mappings Prédéfinis) ---
    var sheetSld = ss.getSheetByName(SHEET_CFG_SLIDES);
    if (sheetSld && data.slideMappings !== undefined) {
      clearSheetData(sheetSld, 1);
      if (data.slideMappings.length > 0) {
        var rows = data.slideMappings.map(function(m) {
          var id = String(m.id || "").trim();
          if (!id) id = "MAP_" + Utilities.getUuid().substring(0,6).toUpperCase();
          return [id, String(m.titre_mg).trim(), String(m.titre_fr).trim(), String(m.tag).trim()];
        }).filter(function(r) { return r[1] !== "" || r[2] !== ""; }); // Doit avoir au moins un titre
        
        if (rows.length > 0) sheetSld.getRange(2, 1, rows.length, 4).setValues(rows);
      }
    }

    // --- 2.5 Écriture CFG_PARAMS ---
    var sheetPar = ss.getSheetByName(SHEET_CFG_PARAMS);
    if (sheetPar) {
      var currentParams = {};
      var lastRow = sheetPar.getLastRow();
      if (lastRow > 1) {
        sheetPar.getRange(2, 1, lastRow - 1, 2).getValues().forEach(function(r) {
          if (r[0]) currentParams[String(r[0]).trim()] = String(r[1] || "").trim();
        });
      }

      var finalAdmin = (data.adminCode !== undefined) ? data.adminCode : (currentParams["admin_code"] || adminCode);
      var finalResp  = (data.respCode !== undefined) ? data.respCode : (currentParams["responsable_code"] || "");
      
      // Extraction automatique de l'ID si l'utilisateur a collé une URL complète
      function cleanDriveId(input) {
          if (!input) return "";
          var str = String(input).trim();
          var match = str.match(/[-\w]{25,}/);
          return match ? match[0] : str;
      }

      var finalFolder = cleanDriveId((data.pdfFolderId !== undefined) ? data.pdfFolderId : (currentParams["pdf_folder_id"] || ""));
      var finalTemplate = cleanDriveId((data.pdfTemplateId !== undefined) ? data.pdfTemplateId : (currentParams["pdf_template_id"] || ""));
      var finalSlidesTpl = cleanDriveId((data.slidesTemplateSalleId !== undefined) ? data.slidesTemplateSalleId : (currentParams["slides_template_salle_id"] || ""));
      var finalSlidesFolder = cleanDriveId((data.slidesFolderId !== undefined) ? data.slidesFolderId : (currentParams["slides_folder_id"] || ""));

      clearSheetData(sheetPar, 1);
      
      var paramsRows = [
        ["admin_code", String(finalAdmin).trim()],
        ["responsable_code", String(finalResp).trim()],
        ["pdf_folder_id", String(finalFolder).trim()],
        ["pdf_template_id", String(finalTemplate).trim()],
        ["slides_template_salle_id", String(finalSlidesTpl).trim()],
        ["slides_folder_id", String(finalSlidesFolder).trim()]
      ];
      sheetPar.getRange(2, 1, paramsRows.length, 2).setValues(paramsRows);
    }

    DICT_CACHE = null;

    return { success: true, msg: "Configuration sauvegardée avec succès." };

  } catch(e) {
    return { success: false, msg: "Erreur technique : " + e.toString() };
  }
}

// ==========================================
// FONCTIONS DE SÉCURITÉ
// ==========================================

function checkAdminCode(inputCode) {
  if (!inputCode) return false;
  return String(inputCode).trim() === getParamValueByKey("admin_code");
}

function verifyResponsableCode(inputCode) {
  if (!inputCode) return false;
  return String(inputCode).trim() === getParamValueByKey("responsable_code");
}

function verifyUniversalCode(inputCode) {
  if (!inputCode) return false;
  var cleanInput = String(inputCode).trim();
  return cleanInput === getParamValueByKey("admin_code") || cleanInput === getParamValueByKey("responsable_code");
}

function verifyValidatorCode(name, inputCode) {
  if (!name || !inputCode) return false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CFG_VALIDEURS);
  if (!sheet) return false;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  var cleanName = String(name).trim().toLowerCase();
  var cleanInput = String(inputCode).trim();

  for (var i = 0; i < data.length; i++) {
    var rowId = String(data[i][0]).toLowerCase().trim();
    var rowName = String(data[i][1]).toLowerCase().trim();
    
    if (rowName === cleanName || rowId === cleanName) {
      return String(data[i][2] || "").trim() === cleanInput;
    }
  }
  return false;
}

function getParamValueByKey(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CFG_PARAMS);
  if (!sheet) return "";
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return "";

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === key) {
      return String(data[i][1] || "").trim();
    }
  }
  return "";
}

function clearSheetData(sheet, startCol) {
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  var maxCols = sheet.getLastColumn();
  
  if (lastRow > 1 && maxCols >= startCol) {
    sheet.getRange(2, startCol, lastRow - 1, (maxCols - startCol) + 1).clearContent();
  }
}

/**
 * Vérifie si le code correspond à l'Admin OU à l'un des Valideurs (Pasteurs)
 * Utilisé spécifiquement pour déverrouiller l'export Word/Docs
 */
function verifyPastorOrAdminCode(inputCode) {
  if (!inputCode) return false;
  var cleanInput = String(inputCode).trim();
  
  // 1. Vérification Code Admin
  if (cleanInput === getParamValueByKey("admin_code")) return true;
  
  // 2. Vérification Liste des Valideurs
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CFG_VALIDEURS);
  if (!sheet) return false;

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  var data = sheet.getRange(2, 1, lastRow - 1, 3).getValues();
  for (var i = 0; i < data.length; i++) {
    // Colonne C (Index 2) contient le code du valideur
    if (String(data[i][2] || "").trim() === cleanInput) {
      return true; 
    }
  }
  
  return false;
}