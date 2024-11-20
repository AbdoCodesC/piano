import {
  Box,
  HStack,
  Icon,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Text,
} from '@chakra-ui/react';
import React, { useState } from 'react';
import { FaMusic } from 'react-icons/fa'; // use: npm i react-icons

interface VolumeControlProps {
  onVolumeChange: (volume: number) => void;
  defaultVolume?: number;
}
export default function VolumeControl({
  onVolumeChange,
  defaultVolume = 100,
}: VolumeControlProps): JSX.Element {
  const [volume, setVolume] = useState(defaultVolume);

  // chakra-ui.com
  return (
    <Box bg='white' p={3} borderRadius='md' boxShadow='sm' zIndex={1000}>
      <HStack spacing={3}>
        <Icon as={FaMusic} color='gray.600' /> {/* music icon */}
        <Text fontSize='sm' color='gray.600'>
          Volume
        </Text>
        <Slider
          aria-label='piano-volume-control'
          defaultValue={defaultVolume}
          min={0}
          max={100}
          width='100px'
          onChange={(val: number) => {
            setVolume(val);
            onVolumeChange(val / 100);
          }}>
          <SliderTrack>
            <SliderFilledTrack />
          </SliderTrack>
          <SliderThumb />
        </Slider>
        <Text fontSize='sm' minWidth='40px' color='gray.600'>
          {volume}%
        </Text>
      </HStack>
    </Box>
  );
}
