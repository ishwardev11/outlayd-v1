import re

files = [
    'src/components/vendors/VendorsClient.tsx',
    'src/components/reports/ReportsClient.tsx',
    'src/components/procurement/ProjectDashboard.tsx',
    'src/components/procurement/EvaluationResults.tsx'
]

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # cleanup leftover artifacts from stripping dark modes
    content = re.sub(r' +:[a-zA-Z0-9\-\/]+\b', '', content)
    content = re.sub(r'className=""\s*', '', content)
    content = re.sub(r' +className="\s*"', '', content)
    
    # ensure Cards are bg-white border border-gray-200 shadow-sm
    content = re.sub(r'<Card>', '<Card className="bg-white border border-gray-200 shadow-sm">', content)
    
    # Text adjustments for badges
    content = re.sub(r'\btext-slate-300\b', 'text-gray-500', content)
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print('Cleanup Done!')
