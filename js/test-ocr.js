const Tesseract = require('tesseract.js');

Tesseract.recognize(
  './sample.png',
  'eng'
)
.then(({ data: { text } }) => {
  console.log('OCR Result:');
  console.log(text);
})
.catch(err => {
  console.error(err);
});