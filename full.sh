#!/bin/bash

input_file="full.tsv"
pages_dir="pages"
deduped_input="full_related_deduped.tsv"
output_file="full_related.tsv"
connection_output="aesthetic_connections.tsv"
tmp_deduped_sorted="tmp_sorted_pairs.tsv"

# Create directory for HTML pages
mkdir -p "$pages_dir"

declare -A name_to_filename

# Ask user whether to skip or re-download
read -p "Redownload all pages? (y/N): " redownload_choice
redownload_choice=${redownload_choice,,}  # lowercase

# Step 0: Build name-to-file map from full.tsv (column 1 = name)
echo "Building name to file map..."
while IFS=$'\t' read -r name url _; do
    safe_name=$(echo "$name" | tr ' /' '__' | tr -cd '[:alnum:]_')
    html_file="$pages_dir/$safe_name.html"
    name_to_filename["$name"]="$html_file"
done < "$input_file"

# Step 1: Optional re-download of files
if [[ "$redownload_choice" == "y" ]]; then
    while IFS=$'\t' read -r name url _; do
        html_file="${name_to_filename[$name]}"
        echo "📥 Downloading: $name ($url)"
        curl -s "$url" -o "$html_file"
        sleep 1
    done < "$input_file"
fi

# Step 2: Extract related aesthetics into TSV
> "$output_file"

echo "Processing related aesthetics..."
for name in "${!name_to_filename[@]}"; do
    html_file="${name_to_filename[$name]}"
    source_aesthetic="$name"

    if [[ ! -f "$html_file" ]]; then
        echo "⚠️ Missing HTML file: $html_file for '$source_aesthetic'" >&2
        continue
    fi

    html=$(cat "$html_file")
    related_list=$(echo "$html" | pup 'div[data-source="related_aesthetics"] a attr{title}')

    while IFS= read -r related; do
        clean_related=$(echo "$related" | awk '{$1=$1};1')
        if [[ -n "$clean_related" ]]; then
            echo -e "$source_aesthetic\t$clean_related" >> "$output_file"
        fi
    done <<< "$related_list"
done

# Step 3: Remove duplicate unordered pairs
awk -F'\t' '{
    a = $1; b = $2;
    if (a > b) {
        tmp = a; a = b; b = tmp
    }
    key = a FS b
    if (!seen[key]++) print key
}' "$deduped_input" > "$tmp_deduped_sorted"

# Step 4: Compare shared motifs/colours/values
> "$connection_output"
echo -e "Aesthetic1\tAesthetic2\tMotifsShared\tColoursShared\tValuesShared" >> "$connection_output"

get_clean_list() {
    local html="$1"
    local field="$2"
    echo "$html" | pup "div[data-source=\"$field\"] text{}" \
        | tr ',' '\n' \
        | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
        | sort -u
}

while IFS=$'\t' read -r a1 a2; do
    file1="${name_to_filename[$a1]}"
    file2="${name_to_filename[$a2]}"

    if [[ ! -f "$file1" || ! -f "$file2" ]]; then
        [[ ! -f "$file1" ]] && echo "⚠️ Missing HTML file for '$a1': $file1" >&2
        [[ ! -f "$file2" ]] && echo "⚠️ Missing HTML file for '$a2': $file2" >&2
        continue
    fi

    html1=$(cat "$file1")
    html2=$(cat "$file2")

    for field in key_motifs key_colours key_values; do
        list1=$(get_clean_list "$html1" "$field")
        list2=$(get_clean_list "$html2" "$field")

        shared_count=$(comm -12 <(echo "$list1") <(echo "$list2") | wc -l)
        declare "${field}_count=$shared_count"
    done

    echo -e "$a1\t$a2\t$key_motifs_count\t$key_colours_count\t$key_values_count" >> "$connection_output"
done < "$tmp_deduped_sorted"

# Step 5: Cleanup
rm -f "$tmp_deduped_sorted"
