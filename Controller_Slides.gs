// =============================================================================
// FICHIER : Controller_Slides.gs
// =============================================================================

function generateSlidesSalle(progId) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. Récupération de la Configuration de base
    var templateId = getParamValueByKey("slides_template_salle_id");
    // On cherche le dossier Slides, s'il est vide on prend celui du PDF en fallback (sécurité)
    var folderId = getParamValueByKey("slides_folder_id") || getParamValueByKey("pdf_folder_id"); 
    
    if (!templateId || !folderId) {
      throw new Error("Configuration manquante : Vérifiez l'ID du modèle Slides et l'ID du dossier de destination dans l'Admin.");
    }

    var progData = getProgrammeDetails(progId);
    if (!progData) throw new Error("Programme introuvable.");

    var dateParts = progData.date.split('/'); 
    var isoDate = (dateParts.length === 3) ? dateParts[2] + "-" + dateParts[1] + "-" + dateParts[0] : progData.date.replace(/\//g,'-');
    var fileName = isoDate + " - " + (progData.titre || "Culte") + " (Salle)";

    // 2. Préchargement EXPLICITE des Configs pour les Slides
    var config = getConfigData();
    var recueilPrefixes = {};
    if (config.recueils) {
        config.recueils.forEach(function(r) {
            if (r.nom) {
                // On force la clé en minuscules
                recueilPrefixes[String(r.nom).trim().toLowerCase()] = r.prefixe || "";
            }
        });
    }
    
    // C'EST ICI QU'ON RÉCUPÈRE LE MAPPING PROPRE DEPUIS LE FICHIER DE CONFIG
    var slideMappings = config.slideMappings || []; 
    console.log("MAPPING CHARGÉ DEPUIS CFG_SLIDES : " + slideMappings.length + " règles trouvées.");

    // 3. Duplication du Modèle
    var folder, templateFile;
    try {
        folder = DriveApp.getFolderById(folderId);
    } catch(e) {
        throw new Error("Le dossier Drive est introuvable. Vérifiez son ID dans la configuration : " + folderId);
    }
    
    try {
        templateFile = DriveApp.getFileById(templateId);
    } catch(e) {
        throw new Error("Le modèle Google Slides est introuvable. Vérifiez l'ID dans la configuration : " + templateId);
    }
    
    var newFile = templateFile.makeCopy(fileName, folder);
    
    // 4. Ouverture de la présentation
    var presentation = SlidesApp.openById(newFile.getId());
    var slides = presentation.getSlides();
    
    // 5. Mapping des Slides Modèles
    var templateMap = {};
    var templateSlidesList = []; 
    
    slides.forEach(function(slide) {
      var notesPage = slide.getNotesPage();
      var speakerNotesShape = notesPage.getSpeakerNotesShape();
      if (speakerNotesShape) {
        var notesText = speakerNotesShape.getText().asString().trim();
        // Regex ultra-tolérante (Capture tout ce qu'il y a entre crochets)
        var match = notesText.match(/\[([A-Za-z0-9_]+)\]/);
        if (match) {
          templateMap[match[1]] = slide;
          templateSlidesList.push(slide);
        }
      }
    });

    // 6. Lecture du programme
    var blocks = [];
    try { blocks = JSON.parse(progData.contenu); } catch(e) {}

    // 7. BOUCLE DE GÉNÉRATION DES BLOCS
    for (var bIdx = 0; bIdx < blocks.length; bIdx++) {
      var block = blocks[bIdx];
      
      function superClean(str) {
          if (!str) return "";
          return String(str).trim().toLowerCase().replace(/\s+/g, ' ');
      }

      var lblMgClean = superClean(block.label_mg);
      var lblFrClean = superClean(block.label_fr);
      var dataTitreClean = (block.data && block.data.titre) ? superClean(block.data.titre) : "";
      
      var niceDate = (progData.date || "").replace(/\//g, ".");
      var intercepted = false;

      // ========================================================
      // INTERCEPTEUR : SLIDES PRÉDÉFINIES
      // ========================================================
      
      for (var sIdx = 0; sIdx < slideMappings.length; sIdx++) {
        var mapping = slideMappings[sIdx];
        var isMatch = false;
        
        var mapMg = superClean(mapping.titre_mg); // ATTENTION : Les clés de l'objet sont 'titre_mg'
        var mapFr = superClean(mapping.titre_fr); // ATTENTION : Les clés de l'objet sont 'titre_fr'

        var matchMg = (mapMg !== "" && (mapMg === lblMgClean || mapMg === dataTitreClean));
        var matchFr = (mapFr !== "" && mapFr === lblFrClean);

        if (mapMg !== "" && mapFr !== "") {
            if (matchMg && matchFr) isMatch = true;
        } else if (mapMg !== "") {
            if (matchMg) isMatch = true;
        } else if (mapFr !== "") {
            if (matchFr) isMatch = true;
        }

        if (isMatch) {
          var tagClean = mapping.tag.replace(/^\[|\]$/g, '').trim(); 
          console.log("-> MATCH TROUVÉ ! L'Admin a demandé d'utiliser : [" + tagClean + "]");
          
          var customSlideTpl = templateMap[tagClean];
          
          if (customSlideTpl) {
            console.log("-> SLIDE TROUVÉE dans le modèle ! Insertion.");
            var customSlide = presentation.appendSlide(customSlideTpl);
            customSlide.replaceAllText("{{date_culte}}", niceDate); 
            intercepted = true; 
          } else {
            console.log("-> ERREUR CRITIQUE : Le tag [" + tagClean + "] est introuvable dans le modèle de présentation Google Slides.");
          }
        }
      }

      if (intercepted) {
          continue; 
      }

      // ========================================================
      // RÈGLE : BLOC INTERLUDE
      // ========================================================
      if (block.type === 'INTERLUDE') {
        var tplSlide = templateMap['TPL_INTERLUDE'];
        if (tplSlide) {
          var newSlide = presentation.appendSlide(tplSlide);
          var titre = (progData.titre && progData.titre.trim() !== "Culte" && progData.titre.trim() !== "") 
                        ? progData.titre.toUpperCase() : ""; 
          var themeMg = (progData.theme_mg || "").replace(/^["“”«»]|["“”«»]$/g, '').trim();
          var themeFr = (progData.theme_fr || "").replace(/^["“”«»]|["“”«»]$/g, '').trim();

          newSlide.replaceAllText("{{titre_culte}}", titre);
          newSlide.replaceAllText("{{date_culte}}", niceDate);
          newSlide.replaceAllText("{{theme_mg}}", themeMg);
          newSlide.replaceAllText("{{theme_fr}}", themeFr);
        }
      }
      
      // ========================================================
      // RÈGLE : BLOC LITURGIE
      // ========================================================
      else if (block.type === 'LITURGIE') {
        var hasTranslation = (block.data && block.data.texte_fr && block.data.texte_fr.trim() !== "");
        var tplSlide = hasTranslation ? templateMap['TPL_LITURGIE_FR'] : templateMap['TPL_LITURGIE_MG'];
        
        if (tplSlide) {
          var newSlide = presentation.appendSlide(tplSlide);
          var lblMg = (block.label_mg && block.label_mg.trim() !== "") ? block.label_mg.trim().toUpperCase() : "";
          var lblFr = (block.label_fr && block.label_fr.trim() !== "") ? block.label_fr.trim().toUpperCase() : "";
          var verset = (block.data && block.data.verset && block.data.verset.trim() !== "") ? block.data.verset.trim() : "";
          var txtMg = (block.data && block.data.texte_mg) ? block.data.texte_mg.trim() : "";
          var txtFr = (block.data && block.data.texte_fr) ? block.data.texte_fr.trim() : "";
          
          newSlide.replaceAllText("{{label_mg}}", lblMg);
          newSlide.replaceAllText("{{label_fr}}", lblFr);
          newSlide.replaceAllText("{{verset}}", verset);
          newSlide.replaceAllText("{{texte_mg}}", txtMg);
          newSlide.replaceAllText("{{texte_fr}}", txtFr);
        }
      }

      // ========================================================
      // RÈGLE : BLOC LECTURE
      // ========================================================
      else if (block.type === 'LECTURE') {
        var hasTranslation = (block.data && block.data.texte_fr && block.data.texte_fr.trim() !== "");
        var tplSlide = hasTranslation ? templateMap['TPL_LECTURE_FR'] : templateMap['TPL_LECTURE_MG'];
        
        if (tplSlide) {
          var newSlide = presentation.appendSlide(tplSlide);
          var lblMg = (block.label_mg && block.label_mg.trim() !== "") ? block.label_mg.trim().toUpperCase() : "";
          var lblFr = (block.label_fr && block.label_fr.trim() !== "") ? block.label_fr.trim().toUpperCase() : "";
          var refMg = (block.data && block.data.ref_mg && block.data.ref_mg.trim() !== "") ? block.data.ref_mg.trim().toUpperCase() : "";
          var refFr = (block.data && block.data.ref_fr && block.data.ref_fr.trim() !== "") ? block.data.ref_fr.trim() : ""; 
          var txtMg = (block.data && block.data.texte_mg) ? block.data.texte_mg.trim() : "";
          var txtFr = (block.data && block.data.texte_fr) ? block.data.texte_fr.trim() : "";
          
          newSlide.replaceAllText("{{label_mg}}", lblMg);
          newSlide.replaceAllText("{{label_fr}}", lblFr);
          newSlide.replaceAllText("{{ref_mg}}", refMg);
          newSlide.replaceAllText("{{ref_fr}}", refFr);
          newSlide.replaceAllText("{{texte_mg}}", txtMg);
          newSlide.replaceAllText("{{texte_fr}}", txtFr);
        }
      }

      // ========================================================
      // RÈGLE : BLOC CHANT (BDB, LIBRE & CHORALE)
      // ========================================================
      else if (block.type === 'CHANT') {
        var lblMg = (block.label_mg && block.label_mg.trim() !== "") ? block.label_mg.trim().toUpperCase() : "";
        var lblFr = (block.label_fr && block.label_fr.trim() !== "") ? block.label_fr.trim() : "";
        var notes = (block.data && block.data.notes) ? block.data.notes.trim() : "";
        
        var isChorale = (lblMg === "HIRA ANTOKO MPIHIRA");
        var isFromDb = (block.data && block.data.id && block.data.mode === 'fixe');
        
        // 1. FORMATAGE DU NUMÉRO (Fihirana = 3 chiffres, Autres = Préfixe)
        var refNumero = "";
        if (isFromDb && block.data.numero) {
          var recKey = String(block.data.recueil).trim().toLowerCase();
          var prefix = recueilPrefixes[recKey] !== undefined ? recueilPrefixes[recKey] : "";
          var num = String(block.data.numero).trim();
          
          if (recKey === 'fihirana') {
             refNumero = ('000' + num).slice(-3); // Force 3 digits
          } else {
             refNumero = prefix ? (prefix + " " + num) : num; // Ne force pas les 3 digits
          }
        }
        
        // FORCAGE EN MAJUSCULES DU TITRE DU CHANT
        var titre = (block.data && block.data.titre) ? block.data.titre.trim().toUpperCase() : "";
        var tonalite = (block.data && block.data.tonalite) ? block.data.tonalite.trim() : "";

        // --- SCÉNARIO 1 : CHANT CHORALE ---
        if (isChorale) {
          var tplCover = templateMap['TPL_CHANT_CHORALE_COVER'];
          if (tplCover) {
            var slideCov1 = presentation.appendSlide(tplCover);
            slideCov1.replaceAllText("{{label_mg}}", lblMg);
            slideCov1.replaceAllText("{{label_fr}}", lblFr);
            slideCov1.replaceAllText("{{titre}}", titre);
            slideCov1.replaceAllText("{{notes}}", notes);
          }
          var tplTexte = templateMap['TPL_CHANT_CHORALE_TEXTE'];
          if (tplTexte) {
            var slideTxt = presentation.appendSlide(tplTexte);
            slideTxt.replaceAllText("{{label_mg}}", lblMg);
            slideTxt.replaceAllText("{{label_fr}}", lblFr);
            slideTxt.replaceAllText("{{ref_numero}}", ""); 
            slideTxt.replaceAllText("{{titre}}", titre);
            slideTxt.replaceAllText("{{tonalite}}", tonalite);
            slideTxt.replaceAllText("{{notes}}", notes);
            slideTxt.replaceAllText("{{X-Mg}}", "");
            slideTxt.replaceAllText("{{X-Fr}}", "");
            var cleanMg = (block.data.paroles_fixe || "").replace(/\n{3,}/g, '\n\n').trim();
            var cleanFr = (block.data.paroles_fr_fixe || "").replace(/\n{3,}/g, '\n\n').trim();
            slideTxt.replaceAllText("{{paroles_mg}}", cleanMg);
            slideTxt.replaceAllText("{{paroles_fr}}", cleanFr);
          }
          if (tplCover) {
            var slideCov2 = presentation.appendSlide(tplCover);
            slideCov2.replaceAllText("{{label_mg}}", lblMg);
            slideCov2.replaceAllText("{{label_fr}}", lblFr);
            slideCov2.replaceAllText("{{titre}}", titre);
            slideCov2.replaceAllText("{{notes}}", ""); 
          }
        }
        
        // --- SCÉNARIO 2 : CHANT LIBRE (Pas de DB) ---
        else if (!isFromDb) {
          var tplLibre = templateMap['TPL_CHANT_LIBRE'];
          if (tplLibre) {
            var slideLib = presentation.appendSlide(tplLibre);
            slideLib.replaceAllText("{{label_mg}}", lblMg);
            slideLib.replaceAllText("{{label_fr}}", lblFr);
            slideLib.replaceAllText("{{ref_numero}}", "");
            slideLib.replaceAllText("{{titre}}", titre);
            slideLib.replaceAllText("{{tonalite}}", tonalite);
            slideLib.replaceAllText("{{notes}}", notes);
            slideLib.replaceAllText("{{X-Mg}}", "");
            slideLib.replaceAllText("{{X-Fr}}", "");
            var cleanMgLib = (block.data.paroles_fixe || "").replace(/\n{3,}/g, '\n\n').trim();
            var cleanFrLib = (block.data.paroles_fr_fixe || "").replace(/\n{3,}/g, '\n\n').trim();
            slideLib.replaceAllText("{{paroles_mg}}", cleanMgLib);
            slideLib.replaceAllText("{{paroles_fr}}", cleanFrLib);
          }
        }
        
        // --- SCÉNARIO 3 : CHANT BDD (Strophe par Strophe) ---
        else {
          var tplBdd = templateMap['TPL_CHANT'];
          if (tplBdd) {
            var textMGArr = (block.data.paroles_fixe || "").split("\n\n"); 
            var textFRArr = (block.data.paroles_fr_fixe || "").split("\n\n");

            textMGArr.forEach(function(txtM, localIdx) {
              txtM = txtM.trim();
              var txtF = (textFRArr[localIdx] || "").trim();
              
              if (txtM !== "") {
                var slideBdd = presentation.appendSlide(tplBdd);
                
                // EXTRACTION DU NUMÉRO OU REFRAIN
                var matchMg = txtM.match(/^(\d+\.|Ref\.|Fiv\.)\s*/i);
                var xMg = matchMg ? matchMg[1] : "";
                txtM = txtM.replace(/^(\d+\.|Ref\.|Fiv\.)\s*/i, ''); // Nettoyage de la phrase
                
                if (xMg.toLowerCase().indexOf('ref') > -1) { xMg = "Fiv."; }

                var matchFr = txtF.match(/^(\d+\.|Ref\.|Fiv\.)\s*/i);
                var xFr = matchFr ? matchFr[1] : "";
                txtF = txtF.replace(/^(\d+\.|Ref\.|Fiv\.)\s*/i, ''); // Nettoyage de la phrase

                slideBdd.replaceAllText("{{label_mg}}", lblMg);
                slideBdd.replaceAllText("{{label_fr}}", lblFr);
                slideBdd.replaceAllText("{{ref_numero}}", refNumero);
                slideBdd.replaceAllText("{{titre}}", titre);
                slideBdd.replaceAllText("{{tonalite}}", tonalite);
                slideBdd.replaceAllText("{{notes}}", notes);
                
                // Injection
                slideBdd.replaceAllText("{{X-Mg}}", xMg);
                slideBdd.replaceAllText("{{X-Fr}}", xFr);
                slideBdd.replaceAllText("{{paroles_mg}}", txtM);
                slideBdd.replaceAllText("{{paroles_fr}}", txtF);
              }
            });
          }
        }
      }

      // ========================================================
      // RÈGLE : BLOC PREDICATION
      // ========================================================
      else if (block.type === 'PREDICATION') {
        var tplSlide = templateMap['TPL_PREDICATION_MG']; 
        if (tplSlide) {
          var newSlide = presentation.appendSlide(tplSlide);
          var themeMg = (progData.theme_mg || "").replace(/^["“”«»]|["“”«»]$/g, '').trim();
          var themeFr = (progData.theme_fr || "").replace(/^["“”«»]|["“”«»]$/g, '').trim();
          newSlide.replaceAllText("{{date_culte}}", niceDate);
          newSlide.replaceAllText("{{theme_mg}}", themeMg);
          newSlide.replaceAllText("{{theme_fr}}", themeFr);
        }
      }

      // ========================================================
      // RÈGLE : BLOC TITRE DE SECTION
      // ========================================================
      else if (block.type === 'TITRE') {
        var tplSlide = templateMap['TPL_TITRE'];
        if (tplSlide) {
          var newSlide = presentation.appendSlide(tplSlide);
          var lblMg = (block.label_mg && block.label_mg.trim() !== "") ? block.label_mg.trim().toUpperCase() : "";
          var lblFr = (block.label_fr && block.label_fr.trim() !== "") ? block.label_fr.trim().toUpperCase() : "";
          newSlide.replaceAllText("{{label_mg}}", lblMg);
          newSlide.replaceAllText("{{label_fr}}", lblFr);
          newSlide.replaceAllText("{{date_culte}}", niceDate);
        }
      }

      // ========================================================
      // RÈGLE : BLOC ANNONCE
      // ========================================================
      else if (block.type === 'ANNONCE') {
        var annonceTags = [
          'TPL_ANNONCE_TITRE', 
          'TPL_ANNONCE_HIVELANY',
          'TPL_ANNONCE_NASIONALY',
          'TPL_ANNONCE_FARITANY',
          'TPL_ANNONCE_TAFO'
        ];
        annonceTags.forEach(function(tag) {
          var tplSlide = templateMap[tag];
          if (tplSlide) {
            var newSlide = presentation.appendSlide(tplSlide);
            newSlide.replaceAllText("{{date_culte}}", niceDate);
          }
        });
      }

      // ========================================================
      // RÈGLES : PRIÈRE & BLOCS LIBRES (Intervention & Texte Simple)
      // ========================================================
      else if (block.type === 'LIBRE' || block.type === 'TEXTE_LIBRE' || block.type === 'PRIERE') {
        var hasTranslation = (block.data && block.data.texte_fr && block.data.texte_fr.trim() !== "");
        var baseKey = 'TPL_' + block.type; // Génère auto : TPL_LIBRE, TPL_TEXTE_LIBRE, TPL_PRIERE
        var tplKey = hasTranslation ? (baseKey + '_FR') : (baseKey + '_MG');
        var tplSlide = templateMap[tplKey];
        
        if (tplSlide) {
          var newSlide = presentation.appendSlide(tplSlide);
          var lblMg = (block.label_mg && block.label_mg.trim() !== "") ? block.label_mg.trim().toUpperCase() : "";
          var lblFr = (block.label_fr && block.label_fr.trim() !== "") ? block.label_fr.trim().toUpperCase() : "";
          var txtMg = (block.data && block.data.texte_mg) ? block.data.texte_mg.trim() : "";
          var txtFr = (block.data && block.data.texte_fr) ? block.data.texte_fr.trim() : "";
          
          newSlide.replaceAllText("{{label_mg}}", lblMg);
          newSlide.replaceAllText("{{label_fr}}", lblFr);
          newSlide.replaceAllText("{{texte_mg}}", txtMg);
          newSlide.replaceAllText("{{texte_fr}}", txtFr);
        }
      }

    } // FIN DE LA BOUCLE for

    // 8. Nettoyage
    templateSlidesList.forEach(function(slide) {
      slide.remove();
    });

    presentation.saveAndClose();
    
    // 9. Mise à jour de la base de données
    var sheetProg = ss.getSheetByName("DB_PROGRAMMES");
    if (sheetProg && progData.rowIndex) {
      sheetProg.getRange(progData.rowIndex, 12).setValue(newFile.getUrl());
    }

    return { success: true, url: newFile.getUrl() };

  } catch (e) {
    return { success: false, error: e.toString() };
  }
}