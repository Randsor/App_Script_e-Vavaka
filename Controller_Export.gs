/* Controller_Export.gs */

var DOC_FONT_FAMILY = "Lato"; 

/**
 * Point d'entrée pour la génération du PDF
 */
function generateProgrammePDF(progId, includeTrans) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. CONFIGURATION
    var config = getConfigData();
    if (!config.pdfTemplateId || !config.pdfFolderId) {
      throw new Error("Configuration PDF incomplète (ID Template ou Dossier).");
    }

    // 2. DONNÉES
    var progData = getProgrammeDetails(progId);
    if (!progData) throw new Error("Programme introuvable.");
    
    // 3. PRÉPARATION FICHIERS
    var folder = DriveApp.getFolderById(config.pdfFolderId);
    var templateFile = DriveApp.getFileById(config.pdfTemplateId);
    
    // 4. COPIE & NOMMAGE (Format ISO AAAA-MM-JJ)
    var dateParts = progData.date.split('/'); 
    var isoDate = dateParts.length === 3 ? (dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0]) : progData.date.replace(/\//g,'-');
    
    var tempDocName = isoDate + " - " + (progData.titre || "Culte");
    var tempFile = templateFile.makeCopy(tempDocName, folder);
    var tempDoc = DocumentApp.openById(tempFile.getId());
    var body = tempDoc.getBody();
    
    // 5. REMPLACEMENT BALISES SIMPLES (Sécurisé)
    // On utilise safeTxt pour éviter que "null" ou "undefined" ne plante replaceText
    body.replaceText("{{Titre_Culte}}", safeTxt(progData.titre));
    var sub = (progData.settings && progData.settings.subTitle) ? progData.settings.subTitle : "";
    body.replaceText("{{Sous-Titre}}", safeTxt(sub));
    body.replaceText("{{DATE}}", safeTxt(progData.date));
    body.replaceText("{{Theme_MG}}", safeTxt(progData.theme_mg));
    body.replaceText("{{Theme_FR}}", safeTxt(progData.theme_fr));
    
    // 6. MOTEUR D'INSERTION (BLINDÉ)
    var blocks = [];
    try { blocks = JSON.parse(progData.contenu); } catch(e) { blocks = []; }
    
    // Recherche de la balise d'ancrage
    var rangeElement = body.findText("{{CONTENU}}");
    var insertionIndex = null; 
    
    if (rangeElement) {
        var element = rangeElement.getElement();
        
        // On remonte jusqu'au paragraphe parent
        var parentParagraph = element.getParent();
        if (parentParagraph.getType() === DocumentApp.ElementType.PARAGRAPH) {
             parentParagraph = parentParagraph.asParagraph();
        }
        
        // VÉRIFICATION DE SÉCURITÉ : Où sommes-nous ?
        // Si le parent du paragraphe n'est pas le BODY (ex: on est dans un tableau), 
        // l'insertion par index est risquée. On bascule en mode "Append" (Fin du doc).
        var container = parentParagraph.getParent();
        
        if (container.getType() === DocumentApp.ElementType.BODY_SECTION) {
            // Cas Standard : On est dans le corps du texte
            insertionIndex = container.getChildIndex(parentParagraph);
            
            // ASTUCE ANTI-CRASH : 
            // Au lieu de supprimer le paragraphe (ce qui plante si c'est le dernier),
            // on remplace le texte par un ESPACE.
            // Cela garde la structure intacte et sert de séparateur.
            parentParagraph.setText(" "); 
            
            // On se place juste après pour commencer à écrire
            insertionIndex++; 
        } else {
            // Cas Complexe (Tableau/Liste) : On efface juste le texte de la balise
            // et on écrira la suite à la fin du document pour ne rien casser.
            element.deleteText(rangeElement.getStartOffset(), rangeElement.getEndOffsetInclusive());
            insertionIndex = null; 
        }
    }
    
    // Boucle de rendu des blocs
    blocks.forEach(function(block) {
       var lastElem = renderBlockToDoc(body, insertionIndex, block, includeTrans);
       
       // Si on est en mode insertion (pas à la fin), on met à jour l'index
       // pour que le prochain bloc s'écrive APRÈS celui qu'on vient de faire
       if(insertionIndex !== null && lastElem) {
           try {
               insertionIndex = body.getChildIndex(lastElem) + 1;
           } catch(e) {
               // En cas de perte de repère, on finit en mode ajout à la fin
               insertionIndex = null; 
           }
       }
    });
    
    tempDoc.saveAndClose();
    
    // 7. GÉNÉRATION PDF
    var pdfBlob = tempFile.getAs(MimeType.PDF);
    pdfBlob.setName(tempDocName + ".pdf");
    
    var pdfFile = folder.createFile(pdfBlob);
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 8. NETTOYAGE
    tempFile.setTrashed(true); // Supprime le brouillon Doc
    
    var pdfUrl = pdfFile.getUrl();
    var downloadUrl = "https://drive.google.com/uc?export=download&id=" + pdfFile.getId();
    
    // Sauvegarde DB
    var sheet = ss.getSheetByName("DB_PROGRAMMES");
    if(sheet && progData.rowIndex) {
        // Colonne 10 (J) pour le lien
        sheet.getRange(progData.rowIndex, 10).setValue(pdfUrl);
    }
    
    return { success: true, url: pdfUrl, downloadUrl: downloadUrl };
    
  } catch (e) {
    console.error("Erreur PDF: " + e.toString());
    // Retourne l'erreur au front pour affichage dans la modale
    return { success: false, error: e.toString() };
  }
}

/**
 * Fonction helper pour sécuriser les chaînes de caractères
 * Transforme null/undefined en ""
 */
function safeTxt(val) {
    if (val === null || val === undefined) return "";
    return String(val);
}

/**
 * Moteur de rendu Block -> Google Doc
 */
function renderBlockToDoc(body, idx, block, includeTrans) {
  // Styles
  var sTitle = {};
  sTitle[DocumentApp.Attribute.FONT_FAMILY] = DOC_FONT_FAMILY;
  sTitle[DocumentApp.Attribute.FONT_SIZE] = 12;
  sTitle[DocumentApp.Attribute.BOLD] = true;
  sTitle[DocumentApp.Attribute.FOREGROUND_COLOR] = "#111827";
  
  var sTxt = {};
  sTxt[DocumentApp.Attribute.FONT_FAMILY] = DOC_FONT_FAMILY;
  sTxt[DocumentApp.Attribute.FONT_SIZE] = 11;
  sTxt[DocumentApp.Attribute.BOLD] = false;
  sTxt[DocumentApp.Attribute.ITALIC] = false;
  sTxt[DocumentApp.Attribute.FOREGROUND_COLOR] = "#374151";
  
  var sMeta = {};
  sMeta[DocumentApp.Attribute.FONT_FAMILY] = DOC_FONT_FAMILY;
  sMeta[DocumentApp.Attribute.FONT_SIZE] = 10;
  sMeta[DocumentApp.Attribute.ITALIC] = true;
  sMeta[DocumentApp.Attribute.FOREGROUND_COLOR] = "#6B7280";

  var lastP = null;

  // Helper d'ajout intelligent (Insert vs Append)
  function add(text, style, indent) {
      // On accepte le texte vide (pour les sauts de ligne) mais on le convertit en espace pour la stabilité
      if (text === null || text === undefined) return null;
      if (text === "") text = " "; 
      
      var p;
      if (idx !== null) {
          try { 
              p = body.insertParagraph(idx, text); 
              idx++; // Avance le curseur local
          } catch(e) { 
              p = body.appendParagraph(text); 
          }
      } else {
          p = body.appendParagraph(text);
      }
      
      if (style) p.setAttributes(style);
      if (indent) p.setIndentStart(indent);
      
      p.setSpacingAfter(4); // Espacement standard
      lastP = p;
      return p;
  }

  // --- RENDU SELON TYPE ---
  
  if (block.type === 'TITRE') {
      var t = safeTxt(block.label_mg).toUpperCase();
      if(includeTrans && block.label_fr) t += " / " + safeTxt(block.label_fr);
      
      var p = add(t, sTitle);
      if(p) { 
          p.setHeading(DocumentApp.ParagraphHeading.HEADING3); 
          p.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
          p.setAttributes(sTitle); // Ré-applique Lato car Heading le change parfois
          p.setSpacingBefore(12); 
          p.setSpacingAfter(8);
      }
      if(block.data && block.data.comment) {
          var pc = add(block.data.comment, sMeta);
          if(pc) pc.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      }
  }
  else if (block.type === 'CHANT') {
      var head = safeTxt(block.label_mg || "HIRA") + ": ";
      if (block.data.id) {
          var rec = safeTxt(block.data.recueil);
          var num = safeTxt(block.data.numero);
          
          if(rec === 'Fihirana') num = ('000' + num).slice(-3);
          else if(rec === 'Fihirana Fanampiny') rec = "FF";
          else if(rec === 'Antema') rec = "AN";
          else if(rec === 'Tsanta') rec = "TS";
          
          head += rec + " " + num + " - " + safeTxt(block.data.titre);
          if (block.data.tonalite) head += " (" + block.data.tonalite + ")";
      } else { 
          head += "Choix libre"; 
      }
      
      var ph = add(head, sTitle);
      if(ph) ph.setSpacingBefore(6);
      
      if(block.data.paroles_fixe) add(block.data.paroles_fixe, sTxt);
      if(includeTrans && block.data.paroles_fr_fixe) add(block.data.paroles_fr_fixe, sMeta, 20);
  }
  else if (block.type === 'LECTURE') {
      var ref = safeTxt(block.data.ref_mg);
      if(includeTrans && block.data.ref_fr) ref += " (" + safeTxt(block.data.ref_fr) + ")";
      
      var ph = add((block.label_mg||"VAKITENY") + ": " + ref, sTitle);
      if(ph) ph.setSpacingBefore(6);
      
      if(block.data.texte_mg) add(block.data.texte_mg, sTxt);
      if(includeTrans && block.data.texte_fr) add(block.data.texte_fr, sMeta, 20);
  }
  else {
      // Cas générique (Prière, Liturgie, Annonce...)
      var lbl = safeTxt(block.label_mg || block.type);
      if(block.role) lbl += " (" + block.role + ")";
      
      var ph = add(lbl, sTitle);
      if(ph) ph.setSpacingBefore(6);
      
      var cm = safeTxt(block.data.contenu_mg || block.data.texte_mg);
      var cf = safeTxt(block.data.contenu_fr || block.data.texte_fr);
      
      if(cm) add(cm, sTxt);
      if(includeTrans && cf) add(cf, sMeta, 20);
  }
  
  // Espaceur final entre blocs
  var sp = add(" ", sTxt); 
  if(sp) sp.setSpacingAfter(4);
  
  return lastP;
}