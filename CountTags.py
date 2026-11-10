
import os
from collections import Counter

# Folder relative to the location of this script
FOLDER = "./data/exports/hakos"

tag_counts = Counter()

# Iterate over all .txt files in the specified folder
for filename in os.listdir(FOLDER):
    if filename.endswith(".txt"):
        filepath = os.path.join(FOLDER, filename)

        with open(filepath, "r", encoding="utf-8") as file:
            for line in file:
                # Split comma-separated tags
                tags = line.strip().split(",")

                # Count each tag, ignoring empty entries and whitespace
                for tag in tags:
                    tag = tag.strip()
                    if tag:
                        tag_counts[tag] += 1

# Print results, sorted by frequency
print("Tag occurrence counts:")
print("-" * 40)

for tag, count in tag_counts.most_common():
    print(f"{tag}: {count}")

print("-" * 40)
print(f"Total unique tags: {len(tag_counts)}")
print(f"Total tag occurrences: {sum(tag_counts.values())}")
