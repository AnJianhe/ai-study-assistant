"""仅生成合成 Office 测试文件，不读取用户文档。"""
import sys
from pathlib import Path
from docx import Document
from pptx import Presentation
from pptx.util import Inches
from openpyxl import Workbook

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
doc = Document()
doc.add_heading('数学复习', 1)
doc.add_paragraph('分数的分母不能为零。')
doc.save(out / 'sample.docx')
ppt = Presentation()
slide = ppt.slides.add_slide(ppt.slide_layouts[6])
box = slide.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(2))
box.text_frame.text = '光的折射测试'
ppt.save(out / 'sample.pptx')
book = Workbook()
sheet = book.active
sheet.title = '学习成绩'
sheet['A1'] = '语文'
sheet['B1'] = 92
book.save(out / 'sample.xlsx')
print('已生成三份合成 Office 测试文件')
