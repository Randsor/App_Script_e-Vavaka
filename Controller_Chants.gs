/**
 * CONTRÔLEUR CHANTS (VERSION INTÉGRALE & SÉCURISÉE)
 * Gestion complète : Recherche, CRUD, Stats, Filtres.
 */

var SHEET_NAME_CHANTS = "DB_CHANTS";
var SHEET_NAME_CONFIG = "CONFIG";

// =============================================================================
// 1. STATISTIQUES (DASHBOARD)
// =============================================================================

function getRepoStats() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  
  // Sécurité : Si feuille vide ou inexistante
  if (!sheet || sheet.getLastRow() < 2) {
    return { total: 0, missingTone: 0, transNone: 0, transPartial: 0 };
  }
  
  // Lecture optimisée de toute la base
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var stats = { total: data.length, missingTone: 0, transNone: 0, transPartial: 0 };
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    
    // Check Tonalité
    if (!row[4] || String(row[4]).trim() === "") stats.missingTone++;
    
    // Check Traduction
    var mg = String(row[5]||"").split(" /// ").filter(function(t) { return t.trim().length > 0; }).length;
    var fr = String(row[6]||"").split(" /// ").filter(function(t) { return t.trim().length > 0; }).length;
    
    if (mg > 0) {
      if (fr === 0) stats.transNone++;
      else if (mg > fr) stats.transPartial++;
    }
  }
  return stats;
}

// =============================================================================
// 2. MOTEUR DE RECHERCHE (BACKEND)
// =============================================================================

/**
 * Fonction centrale de recherche.
 * Gère : Recherche texte, Filtre Recueil, et Filtre par liste d'IDs (Historique)
 */
function searchChantsBackend(query, recueilFilter, historyIds) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Récupération des données jusqu'à la colonne Tags (I)
  var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues(); 

  // --- MODE 1 : FILTRE HISTORIQUE (IDS SPÉCIFIQUES) ---
  if (historyIds && historyIds.length > 0) {
    var safeIds = historyIds.map(function(id) { return String(id).trim(); });
    // On ne renvoie que les chants dont l'ID est dans la liste
    var historyResults = data.filter(function(row) { 
      return safeIds.indexOf(String(row[0]).trim()) > -1; 
    });
    return historyResults.map(formatChantLight);
  }

  // --- MODE 2 : RECHERCHE CLASSIQUE ---
  var q = query ? query.toLowerCase().trim() : "";
  var rFilter = (recueilFilter && recueilFilter !== "ALL") ? recueilFilter.toLowerCase().trim() : null;

  var results = data.filter(function(row) {
    var rowRecueil = String(row[1] || "").toLowerCase().trim();
    
    // A. Application du Filtre Recueil (avec gestion des alias FF/Antema...)
    if (rFilter) {
       // Gestion stricte pour "Fihirana" vs "Fihirana Fanampiny"
       if (rFilter === 'fihirana' && rowRecueil !== 'fihirana') return false;
       if (rFilter === 'fihirana fanampiny' && !rowRecueil.includes('fanampiny')) return false;
       // Gestion générique
       if (rFilter !== 'fihirana' && rFilter !== 'fihirana fanampiny' && !rowRecueil.includes(rFilter)) return false;
    }

    // B. Application du Filtre Texte (Query)
    if (q === "") return true; // Si pas de texte, on garde tout (ce qui a passé le filtre recueil)
    
    // 1. Recherche dans les Méta-données (Rapide)
    var metaIndex = (
      String(row[1]) + " " + // Recueil
      String(row[2]) + " " + // Numéro
      String(row[3]) + " " + // Titre
      String(row[8] || "")   // Tags
    ).toLowerCase();
    
    if (metaIndex.indexOf(q) > -1) return true;
    
    // 2. Recherche dans les Paroles (Contenu)
    var content = (String(row[5]||"") + " " + String(row[6]||"")).toLowerCase();
    if (content.indexOf(q) > -1) {
        // Création du Snippet (Aperçu du texte trouvé)
        var idx = content.indexOf(q);
        var start = Math.max(0, idx - 25);
        var end = Math.min(content.length, idx + 50);
        // Nettoyage des sauts de ligne pour l'affichage en liste
        row.snippet = "..." + content.substring(start, end).replace(/(\r\n|\n|\r)/gm, " ") + "...";
        return true;
    }
    
    return false;
  });

  // Tri des résultats : Par Recueil, puis par Numéro (1, 2, 3...)
  results.sort(function(a, b) {
      var rA = String(a[1]).toLowerCase();
      var rB = String(b[1]).toLowerCase();
      
      // Ordre d'affichage personnalisé
      var order = { 'fihirana': 1, 'fihirana fanampiny': 2, 'antema': 3, 'tsanta': 4 };
      var scoreA = order[rA] || 99;
      var scoreB = order[rB] || 99;
      
      if (scoreA !== scoreB) return scoreA - scoreB;
      
      // Tri numérique (évite que 10 soit avant 2)
      return parseInt(a[2]) - parseInt(b[2]);
  });

  // Pagination : On limite à 50 résultats pour ne pas surcharger l'affichage
  return results.slice(0, 50).map(function(row) {
      var c = formatChantLight(row);
      // On ajoute le snippet s'il a été généré lors de la recherche
      if (row.snippet) c.snippet = row.snippet;
      return c;
  });
}

/**
 * Formateur léger pour les listes (évite d'envoyer tout le texte des paroles)
 */
function formatChantLight(row) {
  // Calcul rapide du statut de traduction pour les badges
  var mg = String(row[5]||"");
  var fr = String(row[6]||"");
  var hasMg = mg.length > 0;
  var hasFr = fr.length > 0;
  
  var status = "ok";
  if (hasMg && !hasFr) status = "none";
  else if (hasMg && hasFr && mg.length > fr.length * 2) status = "partial"; // Estimation grossière

  return {
    id: row[0],
    recueil: row[1],
    numero: row[2],
    titre: row[3],
    tonalite: row[4],
    structure: row[7],
    transStatus: status
  };
}

// =============================================================================
// 3. GESTION DES DÉTAILS & ÉDITION (CRUD)
// =============================================================================

/**
 * Récupère TOUTES les infos d'un chant (pour l'éditeur ou l'insertion)
 */
function getChantDetails(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) return null;
  
  var data = sheet.getDataRange().getValues();
  
  // Recherche linéaire par ID
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      var mg = String(data[i][5]||"");
      var fr = String(data[i][6]||"");
      
      // Calcul précis du statut traduction
      var nMg = mg.split(" /// ").filter(function(t){return t.trim().length>0}).length;
      var nFr = fr.split(" /// ").filter(function(t){return t.trim().length>0}).length;
      var st = "ok"; 
      if(nMg>0 && nFr===0) st="none"; 
      else if(nMg>nFr) st="partial";
      
      return {
        id: data[i][0], 
        recueil: data[i][1], 
        numero: data[i][2], 
        titre: data[i][3], 
        tonalite: data[i][4], 
        paroles_mg: mg, 
        paroles_fr: fr, 
        structure: data[i][7], 
        tags: data[i][8], 
        transStatus: st,
        rowIndex: i + 1
      };
    }
  }
  return null;
}

/**
 * Enregistre un nouveau chant ou met à jour un existant
 */
function saveChantBackend(form) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME_CHANTS);
  
  // Reconstitution des chaînes avec le séparateur " /// "
  var mgFull = (form.strophes_mg || []).join(" /// ");
  var frFull = (form.strophes_fr || []).join(" /// ");
  var structure = (form.types || []).join(",");

  if (form.rowIndex) {
    // --- MODIFICATION ---
    var row = parseInt(form.rowIndex);
    // Mise à jour cellule par cellule
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
    // --- CRÉATION ---
    var prefix = form.recueil ? form.recueil.substring(0, 2).toUpperCase() : "XX";
    // ID unique basé sur le temps
    var newId = prefix + "_" + form.numero + "_" + new Date().getTime().toString().substr(-5);
    
    sheet.appendRow([
      newId, 
      form.recueil, 
      form.numero, 
      form.titre, 
      form.tonalite, 
      mgFull, 
      frFull, 
      structure, 
      form.tags
    ]);
    
    return "Chant créé avec succès !";
  }
}

// =============================================================================
// 4. FONCTIONS UTILITAIRES & FILTRES SPÉCIAUX
// =============================================================================

/**
 * Retourne la liste des recueils disponibles (Utilisé pour les filtres UI)
 */
function getRecueilsFilterList() {
  // Liste standardisée pour l'UI
  return ["Fihirana", "Fihirana Fanampiny", "Antema", "Tsanta"];
}

/**
 * Fonction utilisée par les filtres rapides du Dashboard (Cards)
 * Filtre sur les problèmes de qualité (Manque tonalité, traduction...)
 */
function getChantsByIssue(issueType, idsList) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME_CHANTS);
  if (!sheet) return [];
  
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  
  // Sécurisation des IDs entrants (pour filtre 'specific_ids')
  var safeIds = [];
  if (idsList && Array.isArray(idsList)) {
    safeIds = idsList.map(function(id) { return String(id).trim(); });
  }

  var filtered = data.filter(function(row) {
    // Cas 1 : Filtrage par liste d'IDs (Culte)
    if (issueType === 'specific_ids') {
      if (safeIds.length === 0) return false;
      return safeIds.indexOf(String(row[0]).trim()) > -1;
    }
    
    // Cas 2 : Maintenance Tonalité
    if (issueType === 'missing_tone') {
      return (!row[4] || String(row[4]).trim() === "");
    }
    
    // Cas 3 : Maintenance Traduction
    var mg = String(row[5]||"");
    var fr = String(row[6]||"");
    var nbMg = mg.split(" /// ").filter(function(t){return t.trim().length>0}).length;
    var nbFr = fr.split(" /// ").filter(function(t){return t.trim().length>0}).length;
    
    if (issueType === 'trans_none') return (nbMg > 0 && nbFr === 0);
    if (issueType === 'trans_partial') return (nbMg > nbFr && nbFr > 0);
    
    // Fallback ancien code
    if (issueType === 'missing_trans') return (nbMg > 0 && (nbFr === 0 || nbMg > nbFr));
    
    return false;
  });

  return filtered.map(formatChantLight);
}

/**
 * Wrapper pour compatibilité ascendante (si utilisé par d'anciens appels)
 */
function getChantsByRecueil(recueilName) {
  return searchChantsBackend("", recueilName, []);
}