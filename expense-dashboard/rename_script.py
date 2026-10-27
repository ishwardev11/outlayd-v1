import os
import glob

files = glob.glob('src/**/*', recursive=True)
count = 0

for filepath in files:
    if os.path.isfile(filepath):
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            if 'SpendSync' in content or 'spendsync' in content:
                content = content.replace('SpendSync AI', 'Outlayd')
                content = content.replace('SpendSync', 'Outlayd')
                content = content.replace('spendsync', 'outlayd')
                
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                count += 1
                print(f"Updated {filepath}")
        except Exception as e:
            # Skip binary files or unreadable files
            pass

print(f"Total files updated: {count}")
