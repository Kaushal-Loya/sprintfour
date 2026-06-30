import sys
import json
import fitz

def extract_pdf_data(pdf_path):
    try:
        doc = fitz.open(pdf_path)
        
        full_text = ""
        word_boxes = []
        pages_info = []
        char_index = 0
        
        for page_num, page in enumerate(doc):
            width = page.rect.width
            height = page.rect.height
            pages_info.append({"width": width, "height": height})
            
            # get_text("words") returns tuples: (x0, y0, x1, y1, word, block_no, line_no, word_no)
            words = page.get_text("words")
            
            # Sort words by y0 then x0 for reading order (roughly)
            # PyMuPDF's get_text("words") is mostly reading order, but sorting helps.
            words.sort(key=lambda w: (w[1], w[0]))
            
            for word_tuple in words:
                x0, y0, x1, y1, word, block_no, line_no, word_no = word_tuple
                
                # Append word to full_text
                if full_text and not full_text.endswith("\n"):
                    full_text += " "
                    char_index += 1
                
                start_idx = char_index
                full_text += word
                end_idx = char_index + len(word)
                char_index = end_idx
                
                word_boxes.append({
                    "word": word,
                    "startIndex": start_idx,
                    "endIndex": end_idx,
                    "bbox": {
                        "x0": x0,
                        "y0": y0,
                        "x1": x1,
                        "y1": y1
                    },
                    "pageIndex": page_num,
                    "pageWidth": width,
                    "pageHeight": height
                })
            
            full_text += "\n\n"
            char_index += 2
            
        doc.close()
        
        return {
            "success": True,
            "text": full_text.strip(),
            "wordBoxes": word_boxes,
            "pages": pages_info
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No file path provided"}))
        sys.exit(1)
        
    pdf_path = sys.argv[1]
    result = extract_pdf_data(pdf_path)
    print(json.dumps(result))
