#!/bin/sh
pos=1
while [ $pos -lt 41 ]; do
  currentRating=$(cat top.html | pup 'div.chart_card_ratings' | sed '/i/d' | sed '/</d' | sed -e 's/^[ \t]*//' | sed 's/,//' | sed "$pos!d")
  totalRatings=$((totalRatings + $currentRating))
  scoreSum=$((scoreSum + ($(cat top.html | pup 'span.rating_number text{}' | sed -e 's/^[ \t]*//' | sed "$pos!d") * $currentRating)))
  pos=$((pos+1))
done
echo The average score is $((scoreSum/totalRatings))
