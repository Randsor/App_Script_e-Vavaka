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

var INDENT_STD = 20; 

function generateProgrammePDF(progId, includeTrans) {
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
       // MODIFICATION : On passe progData pour avoir accès aux thèmes
       var newIndex = renderBlockToDoc(body, insertionIndex, block, includeTrans, progData);
       if (insertionIndex !== null && newIndex !== null) insertionIndex = newIndex;
    });
    
    tempDoc.saveAndClose();
    
    var pdfBlob = tempFile.getAs(MimeType.PDF).setName(tempDocName + ".pdf");
    var pdfFile = folder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    tempFile.setTrashed(true);
    
    var sheet = ss.getSheetByName("DB_PROGRAMMES");
    if(sheet && progData.rowIndex) sheet.getRange(progData.rowIndex, 10).setValue(pdfFile.getUrl());
    
    return { success: true, url: pdfFile.getUrl(), downloadUrl: "https://drive.google.com/uc?export=download&id=" + pdfFile.getId() };
    
  } catch (e) {
    return { success: false, error: e.toString() };
  }
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

  if (block.type !== 'CHANT' && block.type !== 'TEXTE_LIBRE' && block.type !== 'TITRE') {
      var label = safeTxt(block.label_mg || block.type);
      if (block.role) label += " (" + block.role + ")";
      addP(label.toUpperCase(), sTitle, 'LEFT', 0, 0); 
      
      if (includeTrans && block.label_fr) {
          addP(block.label_fr, sMeta, 'LEFT', 6, 0); 
      }
  }

  if (block.type === 'TITRE') {
      addP(block.label_mg.toUpperCase(), sTitle, 'CENTER', includeTrans ? 0 : 6);
      if(includeTrans && block.label_fr) addP(block.label_fr, sMeta, 'CENTER', 6);
      if(block.data && block.data.comment) addP(block.data.comment, sMeta, 'LEFT', 6);
  }
  
  else if (block.type === 'CHANT') {
      // 1. Titre Générique
      addP(safeTxt(block.label_mg || "HIRA").toUpperCase(), sTitle, 'LEFT', 0, 0);
      if (includeTrans && block.label_fr) addP(block.label_fr, sMeta, 'LEFT', 6, 0);

      // 2. Ligne Info Chant
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
              
              if (block.data.sequenceSummary && block.data.sequenceSummary.toLowerCase() !== 'tout') {
                  var tStanza = pInfo.appendText(" : " + block.data.sequenceSummary);
                  tStanza.setAttributes(sRef);
              }

              var t2 = pInfo.appendText(" | ");
              t2.setForegroundColor(COLOR_LIGHT).setBold(false).setItalic(false);

              var songTitle = safeTxt(block.data.titre);
              if (block.data.tonalite) songTitle += " (" + block.data.tonalite + ")";
              var t3 = pInfo.appendText(songTitle);
              t3.setForegroundColor(COLOR_DARK).setBold(true).setItalic(false).setFontFamily(DOC_FONT_FAMILY).setFontSize(DOC_FONT_SIZE_TITLE);
              
              pInfo.setSpacingAfter(6);
              pInfo.setIndentStart(INDENT_STD).setIndentFirstLine(INDENT_STD);

          } catch(e) {}
      }

      if(block.data.paroles_fixe) {
          var cleanMG = block.data.paroles_fixe.replace(/\n{3,}/g, '\n\n').trim();
          var cleanFR = includeTrans && block.data.paroles_fr_fixe ? block.data.paroles_fr_fixe.replace(/\n{3,}/g, '\n\n').trim() : "";
          addDualCol(cleanMG, cleanFR);
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
      // Récupération des thèmes depuis progData
      var thMg = progData ? safeTxt(progData.theme_mg) : "";
      var thFr = progData ? safeTxt(progData.theme_fr) : "";
      
      if(thMg || thFr) {
          addDualCol(thMg, thFr);
      } else {
          addP("(Thème non défini)", sMeta, 'LEFT', 6, INDENT_STD);
      }
  }
  
  else {
      var cm = safeTxt(block.data.contenu_mg || block.data.texte_mg);
      var cf = safeTxt(block.data.contenu_fr || block.data.texte_fr);
      addDualCol(cm, cf);
  }

  addP(" ", sTxt, 'LEFT', 6, 0, true);
  
  return currentIdx;
}