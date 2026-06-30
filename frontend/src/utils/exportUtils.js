import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';

export const exportToPDF = (element, filename) => {
  if (!element) return;
  
  // Save original styles
  const originalStyles = {
    height: element.style.height,
    maxHeight: element.style.maxHeight,
    overflow: element.style.overflow,
    overflowY: element.style.overflowY,
    position: element.style.position,
    flex: element.style.flex
  };

  // Temporarily adjust styles to capture full content
  element.style.height = 'auto';
  element.style.maxHeight = 'none';
  element.style.overflow = 'visible';
  element.style.overflowY = 'visible';
  element.style.position = 'static';
  element.style.flex = 'none'; // Disable flex so it grows based on content
  
  const opt = {
    margin:       [10, 10, 10, 10],
    filename:     filename || 'redacted_document.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, scrollY: 0 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  // Use setTimeout to ensure DOM has updated
  setTimeout(() => {
    html2pdf().set(opt).from(element).save().then(() => {
      // Restore styles
      Object.assign(element.style, originalStyles);
    }).catch(err => {
      console.error('PDF export failed:', err);
      Object.assign(element.style, originalStyles);
    });
  }, 100);
};

export const exportToDocx = async (text, spans, filename) => {
  const sortedSpans = [...spans].sort((a, b) => a.startIndex - b.startIndex);
  
  // Split the text into lines to create separate paragraphs
  const lines = text.split('\n');
  const paragraphs = [];
  
  let currentGlobalIndex = 0;
  
  for (let line of lines) {
    const lineEndIndex = currentGlobalIndex + line.length;
    const runs = [];
    let currentLinePos = currentGlobalIndex;
    
    // Find spans that fall within this line
    const lineSpans = sortedSpans.filter(span => 
      (span.startIndex >= currentGlobalIndex && span.startIndex < lineEndIndex) ||
      (span.endIndex > currentGlobalIndex && span.endIndex <= lineEndIndex) ||
      (span.startIndex < currentGlobalIndex && span.endIndex > lineEndIndex)
    );
    
    if (lineSpans.length === 0) {
      // No spans in this line
      if (line.length > 0) {
        runs.push(new TextRun(line));
      } else {
        // Empty line
        runs.push(new TextRun(""));
      }
    } else {
      // Process spans in this line
      for (let span of lineSpans) {
        const start = Math.max(span.startIndex, currentGlobalIndex);
        const end = Math.min(span.endIndex, lineEndIndex);
        
        // Add unredacted text before the span
        if (start > currentLinePos) {
          const beforeText = text.substring(currentLinePos, start);
          runs.push(new TextRun(beforeText));
        }
        
        // Add the redacted span
        // For DOCX, we'll replace the text with a bracketed tag like [NAME]
        runs.push(new TextRun({
          text: `[${span.type}]`,
          bold: true,
          color: "000000",
          shading: {
            type: "clear",
            color: "auto",
            fill: "E2F0CB" // A light green background to mimic the UI
          }
        }));
        
        currentLinePos = end;
      }
      
      // Add any remaining unredacted text at the end of the line
      if (currentLinePos < lineEndIndex) {
        const afterText = text.substring(currentLinePos, lineEndIndex);
        runs.push(new TextRun(afterText));
      }
    }
    
    paragraphs.push(new Paragraph({
      children: runs,
      spacing: {
        after: 120
      }
    }));
    
    currentGlobalIndex = lineEndIndex + 1; // +1 for the newline character
  }
  
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs
      }
    ]
  });
  
  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename || 'redacted_document.docx');
};
