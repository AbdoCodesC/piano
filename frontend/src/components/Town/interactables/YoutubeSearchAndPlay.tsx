import React, { useState, useEffect } from 'react';
import axios from 'axios';
import YouTube from 'react-youtube';

interface YouTubeSearchResult {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    description: string;
    thumbnails: {
      default: { url: string };
    };
  };
}

interface YouTubeSearchAndPlayProps {
  onSearchFocus?: (focused: boolean) => void;  // Add this prop
}

export default function YouTubeSearchAndPlay({ onSearchFocus }: YouTubeSearchAndPlayProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearchInputFocus = () => {
    onSearchFocus?.(true);  // Disable piano keys
  };

  const handleSearchInputBlur = () => {
    onSearchFocus?.(false);  // Enable piano keys
  };

  const fetchYouTubeSearchResults = async (query: string) => {
    setIsLoading(true);
    setError(null);
    const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

    if (!apiKey) {
      setError('API key is missing. Please check configuration.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
        params: {
          part: 'snippet',
          q: query,
          key: apiKey,
          type: 'video',
          maxResults: 5,
          videoCategoryId: '10',
        },
      });
      setSearchResults(response.data.items);
    } catch (err) {
      setError('Failed to fetch results. Please try again.');
      console.error('Search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVideoSelect = (videoId: string) => {
    setSelectedVideoId(videoId);
    setSearchResults([]); // Clear search results
    setSearchQuery(''); // Clear search input
  };

  const handleSearchInputKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      fetchYouTubeSearchResults(searchQuery);
      event.preventDefault(); // Prevent the Enter key from triggering piano keys
    }
  };

  return (
    <div style={{ marginBottom: '20px' }}>
      <input
        type='text'
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        onKeyDown={handleSearchInputKeyPress}
        onFocus={handleSearchInputFocus}
        onBlur={handleSearchInputBlur}
        placeholder='Search for a song...'
        style={{
          width: '100%',
          padding: '10px',
          borderRadius: '4px',
          border: '1px solid #ccc',
        }}
      />
      {searchResults.length > 0 && (
        <ul
          style={{
            marginTop: '10px',
            backgroundColor: 'white',
            padding: '10px',
            borderRadius: '4px',
            listStyle: 'none',
            maxHeight: '200px',
            overflowY: 'auto',
          }}>
          {searchResults.map(result => (
            <li
              key={result.id.videoId}
              onClick={() => handleVideoSelect(result.id.videoId)}
              style={{
                cursor: 'pointer',
                padding: '5px 0',
                borderBottom: '1px solid #eee',
              }}>
              {result.snippet.title}
            </li>
          ))}
        </ul>
      )}
      {selectedVideoId && (
        <div style={{ marginTop: '20px' }}>
          <YouTube
            videoId={selectedVideoId}
            opts={{
              height: '150',
              width: '360',
              playerVars: { autoplay: 1 },
            }}
          />
        </div>
      )}
    </div>
  );
}