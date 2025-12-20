function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Cultes FPMA Toulouse')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      // MODIFICATION ICI : user-scalable=yes permet le zoom
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, user-scalable=yes');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}