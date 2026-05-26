/* Controller_Export.gs - MOTEUR PDF WYSIWYG (FIX STYLES TABLEAUX & PREDICATION) */

// CONFIGURATION VISUELLE
var DOC_FONT_FAMILY = "Roboto"; 
var DOC_FONT_SIZE_TITLE = 11;
var DOC_FONT_SIZE_TEXT = 10; 
var DOC_FONT_SIZE_META = 9;

var COLOR_DARK = "#111827";   
var COLOR_TEXT = "#374151";   
var COLOR_META = "#6B7280";   
var COLOR_BLUE = "#2563EB";   
var COLOR_LIGHT = "#D1D5DB";
var COLOR_RED = "#DC2626"; 

var INDENT_STD = 20; 

function generateProgrammePDF(progId, includeTrans) {
    return generateDocumentBackend(progId, includeTrans, 'PDF');
}

function generateProgrammeDocs(progId, includeTrans) {
    return generateDocumentBackend(progId, includeTrans, 'DOCS');
}

function generateDocumentBackend(progId, includeTrans, targetType) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var config = getConfigData();
    if (!config.pdfTemplateId || !config.pdfFolderId) throw new Error("Config PDF manquante.");

    var progData = getProgrammeDetails(progId);
    if (!progData) throw new Error("Programme introuvable.");
    
    var folder = DriveApp.getFolderById(config.pdfFolderId);
    var templateFile = DriveApp.getFileById(config.pdfTemplateId);
    
    var dateParts = progData.date.split('/'); 
    var isoDate = (dateParts.length === 3) ? dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0] : progData.date.replace(/\//g,'-');
    
    var tempDocName = isoDate + " - " + (progData.titre || "Culte");
    if (targetType === 'DOCS') tempDocName += " (Édition Pasteur)";
    
    var tempFile = templateFile.makeCopy(tempDocName, folder);
    var tempDoc = DocumentApp.openById(tempFile.getId());
    var body = tempDoc.getBody();
    
    body.replaceText("{{Titre_Culte}}", safeTxt(progData.titre));
    body.replaceText("{{Sous-Titre}}", safeTxt(progData.settings ? progData.settings.subTitle : ""));
    body.replaceText("{{DATE}}", safeTxt(progData.date));
    body.replaceText("{{Theme_MG}}", safeTxt(progData.theme_mg));
    body.replaceText("{{Theme_FR}}", safeTxt(progData.theme_fr));
    
    var rangeElement = body.findText("{{CONTENU}}");
    var insertionIndex = null; 
    
    if (rangeElement) {
        var element = rangeElement.getElement();
        var parent = element.getParent();
        if (parent.getType() === DocumentApp.ElementType.PARAGRAPH) {
            parent = parent.asParagraph();
            var container = parent.getParent();
            if (container.getType() === DocumentApp.ElementType.BODY_SECTION) {
                insertionIndex = container.getChildIndex(parent);
                parent.setText(" "); 
                parent.setSpacingAfter(0);
                insertionIndex++; 
            } else {
                element.deleteText(rangeElement.getStartOffset(), rangeElement.getEndOffsetInclusive());
            }
        }
    }
    
    var blocks = [];
    try { blocks = JSON.parse(progData.contenu); } catch(e) {}
    
    blocks.forEach(function(block) {
       var newIndex = renderBlockToDoc(body, insertionIndex, block, includeTrans, progData);
       if (insertionIndex !== null && newIndex !== null) insertionIndex = newIndex;
    });
    
    tempDoc.saveAndClose();
    
    var sheet = ss.getSheetByName("DB_PROGRAMMES");

    if (targetType === 'PDF') {
        // 1. Conversion en Blob
        var pdfBlob = tempFile.getAs(MimeType.PDF).setName(tempDocName + ".pdf");
        
        // 2. Création du fichier PDF
        var pdfFile = folder.createFile(pdfBlob);
        
        // 3. Partage (on entoure de try/catch au cas où l'organisation bloque le partage externe)
        try {
            pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch(e) {
            console.warn("Impossible de modifier les droits de partage : " + e);
        }
        
        // 4. Nettoyage du fichier temporaire (L'étape qui pose souvent problème)
        try {
            try { Drive.Files.remove(tempFile.getId()); } // Tentative API Avancée
            catch(e2) { tempFile.setTrashed(true); }      // Repli API Standard
        } catch(e) { 
            console.warn("Nettoyage tempFile échoué : " + e); 
        }
        
        // 5. Nettoyage de l'ancien PDF et Mise à jour de la feuille
        if (sheet && progData.rowIndex) {
            try {
                var oldPdfLink = sheet.getRange(progData.rowIndex, 10).getValue();
                if (oldPdfLink) {
                    var oldPdfId = extractIdFromUrl(String(oldPdfLink));
                    if (oldPdfId) {
                        try { Drive.Files.remove(oldPdfId); } catch(e3) { DriveApp.getFileById(oldPdfId).setTrashed(true); }
                    }
                }
            } catch(err) { console.warn("Nettoyage ancien PDF échoué"); }
            
            sheet.getRange(progData.rowIndex, 10).setValue(pdfFile.getUrl());
        }
        
        return { 
          success: true, 
          url: pdfFile.getUrl(), 
          downloadUrl: "https://drive.google.com/uc?export=download&id=" + pdfFile.getId() 
        };
        
    } else {
        
        // --- LOGIQUE DOCS ---
        try {
            tempFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.EDIT);
        } catch(e) { console.warn("Erreur partage docs : " + e); }
        
        if (sheet && progData.rowIndex) {
            // NETTOYAGE ANCIEN DOCS SI EXISTANT
            try {
                var oldDocLink = sheet.getRange(progData.rowIndex, 11).getValue();
                if (oldDocLink) {
                    var oldDocId = extractIdFromUrl(String(oldDocLink));
                    if (oldDocId) {
                        try { Drive.Files.remove(oldDocId); } catch(e3) { DriveApp.getFileById(oldDocId).setTrashed(true); }
                    }
                }
            } catch(err) { console.warn("Nettoyage ancien DOCS échoué"); }
            
            // SAUVEGARDE NOUVEAU LIEN
            sheet.getRange(progData.rowIndex, 11).setValue(tempFile.getUrl());
        }
        return { success: true, docUrl: tempFile.getUrl() };
    }
    
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Fonction utilitaire robuste pour extraire l'ID d'un fichier depuis une URL Drive/Docs
 */
function extractIdFromUrl(url) {
    if (!url) return null;
    var match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
}

function safeTxt(val) { 
    if (val === null || val === undefined) return ""; 
    return String(val).trim(); 
}

// MODIFICATION SIGNATURE : ajout de progData
function renderBlockToDoc(body, startIdx, block, includeTrans, progData) {
  var currentIdx = startIdx;

  // --- STYLES ---
  var sTitle = {}; 
  sTitle[DocumentApp.Attribute.FONT_FAMILY] = DOC_FONT_FAMILY; 
  sTitle[DocumentApp.Attribute.FONT_SIZE] = DOC_FONT_SIZE_TITLE; 
  sTitle[DocumentApp.Attribute.BOLD] = true; 
  sTitle[DocumentApp.Attribute.ITALIC] = false; 
  sTitle[DocumentApp.Attribute.FOREGROUND_COLOR] = COLOR_DARK;
  
  var sTxt = {}; 
  sTxt[DocumentApp.Attribute.FONT_FAMILY] = DOC_FONT_FAMILY; 
  sTxt[DocumentApp.Attribute.FONT_SIZE] = DOC_FONT_SIZE_TEXT; 
  sTxt[DocumentApp.Attribute.FOREGROUND_COLOR] = COLOR_TEXT; 
  sTxt[DocumentApp.Attribute.BOLD] = false; 
  sTxt[DocumentApp.Attribute.ITALIC] = false; 
  
  var sMeta = {}; 
  sMeta[DocumentApp.Attribute.FONT_FAMILY] = DOC_FONT_FAMILY; 
  sMeta[DocumentApp.Attribute.FONT_SIZE] = DOC_FONT_SIZE_META; 
  sMeta[DocumentApp.Attribute.ITALIC] = true; 
  sMeta[DocumentApp.Attribute.BOLD] = false;
  sMeta[DocumentApp.Attribute.FOREGROUND_COLOR] = COLOR_META;

  var sRef = {};
  sRef[DocumentApp.Attribute.FONT_FAMILY] = DOC_FONT_FAMILY; 
  sRef[DocumentApp.Attribute.FONT_SIZE] = DOC_FONT_SIZE_TITLE; 
  sRef[DocumentApp.Attribute.ITALIC] = false; 
  sRef[DocumentApp.Attribute.BOLD] = true;
  sRef[DocumentApp.Attribute.FOREGROUND_COLOR] = COLOR_BLUE;

  var sRefFr = {}; 
  sRefFr[DocumentApp.Attribute.FONT_FAMILY] = DOC_FONT_FAMILY; 
  sRefFr[DocumentApp.Attribute.FONT_SIZE] = DOC_FONT_SIZE_META; 
  sRefFr[DocumentApp.Attribute.ITALIC] = false; 
  sRefFr[DocumentApp.Attribute.BOLD] = true;
  sRefFr[DocumentApp.Attribute.FOREGROUND_COLOR] = COLOR_META;

  // --- HELPER D'INSERTION ---
  function addP(text, style, align, spacingAfter, indent, isSpacer) {
      var str = safeTxt(text);
      if (!str && !isSpacer) return; 
      if (!str && isSpacer) str = " "; 
      
      var p;
      try {
          if (currentIdx !== null) { p = body.insertParagraph(currentIdx, str); currentIdx++; } 
          else { p = body.appendParagraph(str); }
      } catch(e) {
          p = body.appendParagraph(str); currentIdx = null; 
      }

      if (style) p.setAttributes(style);
      
      if (align === 'CENTER') p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      else if (align === 'JUSTIFY') p.setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
      else p.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
      
      if (indent) {
          p.setIndentStart(indent);
          p.setIndentFirstLine(indent); 
      }
      
      p.setSpacingAfter(spacingAfter !== undefined ? spacingAfter : 6);
      p.setSpacingBefore(0);
      return p;
  }

  // --- HELPER DOUBLE COLONNE ---
  function addDualCol(txtMG, txtFR) {
      if (!includeTrans || !txtFR) {
          addP(txtMG, sTxt, 'JUSTIFY', 6, INDENT_STD);
          return;
      }
      
      var table;
      try {
          if (currentIdx !== null) { table = body.insertTable(currentIdx); currentIdx++; }
          else { table = body.appendTable(); }
      } catch(e) { table = body.appendTable(); currentIdx = null; }
      
      var row = table.appendTableRow();
      table.setBorderWidth(0);
      
      var cell1 = row.appendTableCell(safeTxt(txtMG));
      cell1.setWidth(280); 
      cell1.setPaddingTop(0).setPaddingBottom(6).setPaddingLeft(INDENT_STD).setPaddingRight(10);
      
      var numChildren1 = cell1.getNumChildren();
      for (var i = 0; i < numChildren1; i++) {
          var child = cell1.getChild(i);
          if (child.getType() === DocumentApp.ElementType.PARAGRAPH) {
              child.asParagraph().setAttributes(sTxt); 
              child.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
          }
      }
      
      var cell2 = row.appendTableCell(safeTxt(txtFR));
      cell2.setPaddingTop(0).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(0);
      
      var numChildren2 = cell2.getNumChildren();
      for (var j = 0; j < numChildren2; j++) {
          var child2 = cell2.getChild(j);
          if (child2.getType() === DocumentApp.ElementType.PARAGRAPH) {
              child2.asParagraph().setAttributes(sMeta); 
              child2.asParagraph().setAlignment(DocumentApp.HorizontalAlignment.JUSTIFY);
          }
      }
  }

  // --- RENDU BLOCS ---

  // On exclut COMMENTAIRE de l'affichage des titres
  if (block.type !== 'CHANT' && block.type !== 'TEXTE_LIBRE' && block.type !== 'TITRE' && block.type !== 'COMMENTAIRE') {
      var label = safeTxt(block.label_mg || block.type);
      if (block.role) label += " (" + block.role + ")";
      var pLabel = addP(label.toUpperCase(), sTitle, 'LEFT', 0, 0); 
      
      // On passe les titres en BLEU
      if (pLabel && ['LITURGIE', 'PRIERE', 'FANEKENA', 'PREDICATION'].includes(block.type)) {
          pLabel.setForegroundColor(COLOR_BLUE);
      }
      
      if (includeTrans && block.label_fr) {
          addP(block.label_fr, sMeta, 'LEFT', 6, 0); 
      }
  }

  if (block.type === 'TITRE') {
      var pTitre = addP(block.label_mg.toUpperCase(), sTitle, 'CENTER', includeTrans ? 0 : 6);
      if (pTitre) pTitre.setForegroundColor(COLOR_BLUE); // On passe le Titre en BLEU
      
      if(includeTrans && block.label_fr) addP(block.label_fr, sMeta, 'CENTER', 6);
      if(block.data && block.data.comment) addP(block.data.comment, sMeta, 'LEFT', 6);
  }
  
  else if (block.type === 'CHANT') {
      // 1. Titre Générique (En ROUGE)
      var pChantTitle = addP(safeTxt(block.label_mg || "HIRA").toUpperCase(), sTitle, 'LEFT', 0, 0);
      if (pChantTitle) pChantTitle.setForegroundColor(COLOR_RED);
      
      if (includeTrans && block.label_fr) addP(block.label_fr, sMeta, 'LEFT', 6, 0);

      // 2. Ligne Info Chant (Toute la ligne en ROUGE)
      if (block.data.id) {
          var pInfo;
          try {
              if (currentIdx !== null) { pInfo = body.insertParagraph(currentIdx, ""); currentIdx++; } 
              else { pInfo = body.appendParagraph(""); }
              
              var rec = safeTxt(block.data.recueil);
              var num = safeTxt(block.data.numero);
              var badgeText = num;
              if(rec === 'Fihirana') badgeText = ('000' + num).slice(-3);
              else if(rec.includes('Fanampiny')) badgeText = "FF " + num;
              else if(rec === 'Antema') badgeText = "AN " + num;
              else if(rec === 'Tsanta') badgeText = "TS " + num;
              
              var t1 = pInfo.appendText(badgeText);
              t1.setAttributes(sRef); 
              t1.setForegroundColor(COLOR_RED); // ROUGE
              
              if (block.data.sequenceSummary && block.data.sequenceSummary.toLowerCase() !== 'tout') {
                  var tStanza = pInfo.appendText(" : " + block.data.sequenceSummary);
                  tStanza.setAttributes(sRef);
                  tStanza.setForegroundColor(COLOR_RED); // ROUGE
              }

              var t2 = pInfo.appendText(" | ");
              t2.setForegroundColor(COLOR_RED).setBold(false).setItalic(false); // ROUGE

              var songTitle = safeTxt(block.data.titre);
              if (block.data.tonalite) songTitle += " • " + block.data.tonalite;
              var t3 = pInfo.appendText(songTitle);
              t3.setForegroundColor(COLOR_RED).setBold(true).setItalic(false).setFontFamily(DOC_FONT_FAMILY).setFontSize(DOC_FONT_SIZE_TITLE); // ROUGE
              
              pInfo.setSpacingAfter(6);
              pInfo.setIndentStart(INDENT_STD).setIndentFirstLine(INDENT_STD);

          } catch(e) {}
      } else if (block.data.titre) {
          // CAS SAISIE LIBRE : On imprime juste le titre saisi à la main
          var pInfoLibre;
          try {
              if (currentIdx !== null) { pInfoLibre = body.insertParagraph(currentIdx, ""); currentIdx++; } 
              else { pInfoLibre = body.appendParagraph(""); }
              
              var tLibre = pInfoLibre.appendText(safeTxt(block.data.titre));
              tLibre.setForegroundColor(COLOR_RED).setBold(true).setItalic(false).setFontFamily(DOC_FONT_FAMILY).setFontSize(DOC_FONT_SIZE_TITLE); // ROUGE
              
              pInfoLibre.setSpacingAfter(6);
              pInfoLibre.setIndentStart(INDENT_STD).setIndentFirstLine(INDENT_STD);
         } catch(e) {}
      }

      // --- NOUVEAU : IMPRESSION DE LA NOTE DU CHANT ---
      if (block.data.notes && block.data.notes.trim() !== "") {
          // Ajout du caractère i entouré
          addP("ⓘ " + block.data.notes.trim(), sMeta, 'LEFT', 6, INDENT_STD);
      }

      if(block.data.paroles_fixe) {
          var cleanMG = block.data.paroles_fixe.replace(/\n{3,}/g, '\n\n').trim();
          var cleanFR = includeTrans && block.data.paroles_fr_fixe ? block.data.paroles_fr_fixe.replace(/\n{3,}/g, '\n\n').trim() : "";
          addDualCol(cleanMG, cleanFR);
      }
  }

  else if (block.type === 'INTERLUDE') {
      var table;
      try {
          if (currentIdx !== null) { table = body.insertTable(currentIdx); currentIdx++; }
          else { table = body.appendTable(); }
      } catch(e) { table = body.appendTable(); currentIdx = null; }
      
      var row = table.appendTableRow();
      var cell = row.appendTableCell();
      
      table.setBorderWidth(1);
      table.setBorderColor("#E5E7EB");
      cell.setBackgroundColor("#F9FAFB");
      cell.setPaddingTop(12).setPaddingBottom(12).setPaddingLeft(INDENT_STD).setPaddingRight(INDENT_STD);
      
      var labelMg = safeTxt(block.label_mg) || "FEONJAVAMANENO";
      
      // Sécurité : On s'assure d'avoir au moins un paragraphe
      var pLabel;
      if (cell.getNumChildren() > 0 && cell.getChild(0).getType() === DocumentApp.ElementType.PARAGRAPH) {
          pLabel = cell.getChild(0).asParagraph();
      } else {
          pLabel = cell.appendParagraph("");
      }
      
      pLabel.setText(labelMg.toUpperCase());
      pLabel.setAttributes(sTitle).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      
      var labelFr = safeTxt(block.label_fr);
      if (includeTrans && labelFr !== "") {
          var pFr = cell.appendParagraph(labelFr);
          pFr.setAttributes(sMeta).setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingAfter(8);
      } else {
          pLabel.setSpacingAfter(8);
      }

      var morceau = safeTxt(block.data.titre);
      var tonalite = safeTxt(block.data.tonalite);
      if (tonalite !== "") {
          if (morceau !== "") morceau += " • " + tonalite;
          else morceau = tonalite;
      }

      if (morceau !== "") {
          var pMorceau = cell.appendParagraph(morceau);
          pMorceau.setAttributes(sTxt).setBold(true).setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingAfter(0);
      }
  }
  
  else if (block.type === 'LECTURE') {
      if (block.data.ref_mg) addP(block.data.ref_mg, sRef, 'LEFT', includeTrans ? 0 : 6, INDENT_STD);
      if (includeTrans && block.data.ref_fr) addP(block.data.ref_fr, sRefFr, 'LEFT', 6, INDENT_STD);
      
      addDualCol(block.data.texte_mg, block.data.texte_fr);
  }
  
  else if (block.type === 'LITURGIE') {
      if(block.data.verset) {
          var pV = addP(block.data.verset, sTitle, 'LEFT', 6, INDENT_STD);
          if(pV) pV.setForegroundColor(COLOR_BLUE); 
      }
      addDualCol(block.data.texte_mg, block.data.texte_fr);
      if(block.data.comment) addP(block.data.comment, sMeta, 'LEFT', 6, INDENT_STD);
  }
  
  else if (block.type === 'FANEKENA') {
      if(block.data.titre && block.data.titre !== block.label_mg) {
           addP(block.data.titre, sTitle, 'LEFT', 6, INDENT_STD);
      }
      addDualCol(block.data.contenu_mg, block.data.contenu_fr);
  }
  
  // MODIFICATION : CAS PREDICATION
  else if (block.type === 'PREDICATION') {
      var thMg = progData ? safeTxt(progData.theme_mg) : "";
      var thFr = progData ? safeTxt(progData.theme_fr) : "";
      if(thMg || thFr) addDualCol(thMg, thFr);
      else addP("(Thème non défini)", sMeta, 'LEFT', 6, INDENT_STD);
  }
  
  // NOUVEAU : LE CALLOUT COMMENTAIRE (OU AUTRES TEXTES)
  else {
      // On affiche le contenu s'il y en a un (Pour LECTURE, LITURGIE, LIBRE...)
      var cm = safeTxt(block.data.contenu_mg || block.data.texte_mg);
      var cf = safeTxt(block.data.contenu_fr || block.data.texte_fr);
      if (block.type !== 'COMMENTAIRE') {
          addDualCol(cm, cf);
      }
  }

  // --- RENDU DU CALLOUT (NOTION STYLE) ---
  // Déclenché soit par le bloc 'COMMENTAIRE', soit par l'ancien champ 'comment'
  var hasComment = (block.type === 'COMMENTAIRE' && block.data.comment) || (block.type !== 'COMMENTAIRE' && block.data.comment);
  
  if (hasComment) {
      var txtComment = safeTxt(block.data.comment);
      
      var tableCallout;
      try {
          if (currentIdx !== null) { tableCallout = body.insertTable(currentIdx); currentIdx++; }
          else { tableCallout = body.appendTable(); }
      } catch(e) { tableCallout = body.appendTable(); currentIdx = null; }
      
      var rowC = tableCallout.appendTableRow();
      var cellC = rowC.appendTableCell();
      
      // Style Callout (Fond gris clair, sans bordures)
      tableCallout.setBorderWidth(0); 
      cellC.setBackgroundColor("#F3F4F6"); // Un gris légèrement plus soutenu pour qu'il soit bien visible à l'impression
      cellC.setPaddingTop(6).setPaddingBottom(6).setPaddingLeft(10).setPaddingRight(10);
      
     var pCallout;
      if (cellC.getNumChildren() > 0 && cellC.getChild(0).getType() === DocumentApp.ElementType.PARAGRAPH) {
          pCallout = cellC.getChild(0).asParagraph();
      } else {
          pCallout = cellC.appendParagraph("");
      }
      
      // On ajoute un indicateur visuel (i entouré) pour compenser l'absence de bordure gauche
      pCallout.setText("ⓘ " + txtComment);
      
      // On applique le style meta (italique, gris)
      pCallout.setAttributes(sMeta).setAlignment(DocumentApp.HorizontalAlignment.LEFT).setSpacingAfter(0);
      
      // Retrait de la marge pour le tableau
      try {
          var tAttrs = {};
          tAttrs[DocumentApp.Attribute.MARGIN_LEFT] = INDENT_STD;
          tableCallout.setAttributes(tAttrs);
      } catch(e){}
  }

  // Espacement final entre chaque bloc (sauf si c'est la fin)
  addP(" ", sTxt, 'LEFT', 6, 0, true);
  
  return currentIdx;
}