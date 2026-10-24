"""Create the assessment's required Word disclosure without third-party Python packages."""
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]  # Resolve source/output relative to this checkout.
source = (ROOT / 'docs/AI_PROMPTS_DISCLOSURE.md').read_text(encoding='utf-8-sig')
paragraphs = []
for line in source.splitlines():
    if line.startswith('```'):
        continue  # Code-fence markers are Markdown formatting rather than disclosure text.
    level = len(line) - len(line.lstrip('#'))
    style = f'Heading{min(level, 3)}' if level else 'Normal'
    text = line[level:].strip() if level else line
    paragraphs.append(f'<w:p><w:pPr><w:pStyle w:val="{style}"/></w:pPr>'
                      f'<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>')
document = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body>' + ''.join(paragraphs) +
            '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
            '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>'
            '</w:sectPr></w:body></w:document>')
styles = ('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
          '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
          '<w:sz w:val="22"/><w:color w:val="293A31"/></w:rPr></w:rPrDefault></w:docDefaults>'
          '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>'
          '<w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:style>' +
          ''.join(f'<w:style w:type="paragraph" w:styleId="Heading{i}"><w:name w:val="heading {i}"/>'
                  '<w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/>'
                  f'<w:outlineLvl w:val="{i-1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="{36-i*4}"/>'
                  '</w:rPr></w:style>' for i in range(1, 4)) + '</w:styles>')
content_types = ('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                 '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                 '<Default Extension="xml" ContentType="application/xml"/>'
                 '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
                 '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
                 '</Types>')
relationships = ('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
                 '</Relationships>')
document_relationships = ('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                          '</Relationships>')
with ZipFile(ROOT / 'AI_Prompts.docx', 'w', ZIP_DEFLATED) as output:
    for name, text in {'[Content_Types].xml': content_types, '_rels/.rels': relationships,
                       'word/document.xml': document, 'word/styles.xml': styles,
                       'word/_rels/document.xml.rels': document_relationships}.items():
        output.writestr(name, text.encode('utf-8'))  # Package the standard Word Open XML parts.
print('Generated AI_Prompts.docx from docs/AI_PROMPTS_DISCLOSURE.md')
