#!/bin/bash

input_file="full.tsv"
pages_dir="pages"
connection_output="connections.tsv"
tmp_deduped_sorted="tmp_sorted_pairs.tsv"

# Create directory for HTML pages
mkdir -p "$pages_dir"

read -p "Check for new Aesthetics? (y/n): " update_choice
update_choice=${update_choice,,}

if [[ "$update_choice" == "y" ]]; then
    curl -s "https://aesthetics.fandom.com/wiki/List_of_Aesthetics" \
    | pup 'ul li a[href^="/wiki/"] attr{href}' \
    | grep -vE 'Category:|Talk:' \
    | sort -u \
    | sed 's|^|https://aesthetics.fandom.com|' \
    | awk -F'/' '{name=$NF; gsub(/_/," ",name); print name "\t" $0}' \
    | while IFS=$'\t' read -r raw_name full_url; do
        decoded_name=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$raw_name'))")
        html_file="$pages_dir/$decoded_name.html"
        echo -e "$decoded_name\t$full_url\t$html_file"
    done > "$input_file"

    echo "$input_file updated."
fi

# If full.tsv doesn't exist or is empty, exit
if [[ ! -s "$input_file" ]]; then
    echo "Error: $input_file does not exist or is empty. Exiting."
    exit 1
fi

declare -A name_to_filename

read -p "Redownload all pages? (y/n): " redownload_choice
redownload_choice=${redownload_choice,,}

echo "Updating file paths and appending aliases..."
{
    line_count=0
    while IFS=$'\t' read -r name url html_file rest; do
        ((line_count++))

        if [[ "$redownload_choice" == "y" ]]; then
            >&2 echo "Downloading: $url"
            curl -s "$url" -o "$html_file"
            sleep 1
        elif [[ ! -f "$html_file" ]]; then
            >&2 echo "Warning: HTML file '$html_file' not found. Skipping download due to user choice."
        else
            >&2 echo $html_file
        fi

        name_to_filename["$name"]="$html_file"

        aliases=()
        if [[ -f "$html_file" ]]; then
            html=$(cat "$html_file")
            other_names=$(echo "$html" \
                | pup 'div.pi-item.pi-data.pi-item-spacing.pi-border-color[data-source="other_names"] text{}' \
                | grep -v -i '^other names$')

            while IFS= read -r alias; do
                clean_alias=$(echo "$alias" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                if [[ -n "$clean_alias" ]]; then
                    aliases+=("$clean_alias")
                fi
            done <<< "$(echo "$other_names" | tr ',' '\n')"
        fi

        echo -en "$name\t$url\t$html_file"
        for alias in "${aliases[@]}"; do
            echo -en "\t$alias"
        done
        echo
    done < "$input_file"
    >&2 echo "Total entries processed: $line_count"
} > "tmp_with_aliases.tsv"

mv "tmp_with_aliases.tsv" "$input_file"

> "$connection_output"
echo -e "Aesthetic1\tAesthetic2\tMotifsShared\tColoursShared\tValuesShared\tDecadesShared\tTotalShared" >> "$connection_output"

echo "Extracting connections..."

# Build mapping from all alias names to their main aesthetic
declare -A alias_to_main
while IFS=$'\t' read -r main _ _ rest; do
    alias_to_main["$main"]="$main"
    for alias in $rest; do
        alias_to_main["$alias"]="$main"
    done
done < "$input_file"

mapfile -t aesthetics < <(cut -f1 "$input_file")
declare -A seen_pairs

echo "Processed"

for a1 in "${aesthetics[@]}"; do
    f1="${name_to_filename[$a1]}"
    [[ ! -f "$f1" ]] && continue

    html1=$(cat "$f1")

    related_list=$(echo "$html1" \
        | pup 'div.pi-item.pi-data.pi-item-spacing.pi-border-color[data-source="related_aesthetics"] a attr{title}' \
        | sort -u)

    while IFS= read -r a2; do
        a2_main="${alias_to_main[$a2]}"
        [[ -z "$a2_main" ]] && continue
        f2="${name_to_filename[$a2_main]}"
        [[ ! -f "$f2" ]] && continue

        # Check for existing pair in either order
        key1="$a1::$a2_main"
        key2="$a2_main::$a1"
        if [[ -n "${seen_pairs[$key1]}" || -n "${seen_pairs[$key2]}" ]]; then
            continue
        fi
        seen_pairs[$key1]=1

        html2=$(cat "$f2")

        get_clean_list() {
    local html="$1"
    local field="$2"

    echo "$html" \
            | pup "div.pi-item.pi-data.pi-item-spacing.pi-border-color[data-source=\"$field\"] text{}" \
            | tr ',' '\n' \
            | sed 's/[^a-zA-Z0-9]//g' \
            | tr '[:upper:]' '[:lower:]' \
            | grep -v '^$' \
            | sort -u
    }
    
    get_clean_decades() {
        local html="$1"
    
        echo "$html" \
            | pup "div.pi-item.pi-data.pi-item-spacing.pi-border-color[data-source=\"decade_of_origin\"] text{}" \
            | tr ',' '\n' \
            | sed -E 's/[^0-9]*([0-9]{3}).*/\1/' \
            | grep -E '^[0-9]{3}$' \
            | sort -u
    }



        motifs1=$(get_clean_list "$html1" "Key motifs")
        motifs2=$(get_clean_list "$html2" "Key motifs")
        motifs_shared=$(comm -12 <(echo "$motifs1") <(echo "$motifs2") | wc -l)

        colours1=$(get_clean_list "$html1" "Key colours")
        colours2=$(get_clean_list "$html2" "Key colours")
        colours_shared=$(comm -12 <(echo "$colours1") <(echo "$colours2") | wc -l)

        values1=$(get_clean_list "$html1" "Key values")
        values2=$(get_clean_list "$html2" "Key values")
        values_shared=$(comm -12 <(echo "$values1") <(echo "$values2") | wc -l)

        decades1=$(get_clean_decades "$html1")
        decades2=$(get_clean_decades "$html2")
        decades_shared=$(comm -12 <(echo "$decades1") <(echo "$decades2") | wc -l)

        total_shared=$((motifs_shared + colours_shared + values_shared + decades_shared))

        echo -e "$a1\t$a2_main\t$motifs_shared\t$colours_shared\t$values_shared\t$decades_shared\t$total_shared" >> "$connection_output"
    done <<< "$related_list"

    echo "$a1..."
done

echo "All connections written to $connection_output."
